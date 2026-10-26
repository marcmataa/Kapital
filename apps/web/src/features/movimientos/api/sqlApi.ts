import { api, aErrorApi, type ErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';
import type { Filtros } from '../lib/filtros';
import { esUuid, type SentidoAjuste, type TipoMovimiento } from '../lib/tipos';

/*
 * Cálculos de la lista y del formulario hechos en SQL (migración 20261024000001_movimientos_ux).
 * Los importes se piden con `::text` sobre el resultado de la función: PostgREST devuelve
 * `numeric` como número JSON y aquí nunca se opera con ellos.
 */

type Resultado<T> = { data: T } | { error: ErrorApi };

async function capturar<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    return { error: aErrorApi(e) };
  }
}

type RespuestaRpc = PromiseLike<{ data: unknown; error: unknown }>;

async function filas<T>(consulta: RespuestaRpc): Promise<Resultado<T[]>> {
  const { data, error } = await consulta;
  if (error) return { error: aErrorApi(error) };
  return { data: (data ?? []) as T[] };
}

/** Argumentos comunes de los filtros de la lista (mismos nombres que en SQL). */
export function argsFiltros(f: Filtros) {
  return {
    p_q: f.q === '' ? null : f.q,
    p_desde: f.desde,
    p_hasta: f.hasta,
    p_categoria: f.categoria !== null && esUuid(f.categoria) ? f.categoria : null,
    p_metodo: f.metodo,
    p_cuenta: f.cuenta !== null && esUuid(f.cuenta) ? f.cuenta : null,
  };
}

export interface TotalTipo {
  tipo: TipoMovimiento;
  n: number;
  /** Positivo, salvo en ajustes (neto: suma − resta). 'd.dd'. */
  total: string;
}

export interface SubtotalDia {
  fecha: string;
  n: number;
  /** Balance del día (ingresos + devoluciones − gastos); null si solo hay traspasos o ajustes. */
  balance: string | null;
}

export interface ResumenFiltro {
  n: number;
  ingresos: string | null;
  gastos_netos: string | null;
  balance: string | null;
  ajustes: string | null;
  dias: number | null;
  gasto_medio_diario: string | null;
  categoria_id: string | null;
  categoria_gasto: string | null;
}

export interface GastoDevolvible {
  id: string;
  fecha: string;
  concepto: string;
  importe: string;
  /** Lo que queda por devolver (importe − devoluciones ya vinculadas), 'd.dd'. */
  pendiente: string;
  categoria_id: string;
  cuenta_id: string;
}

export interface CalculoAjuste {
  saldo_app: string;
  saldo_real: string;
  /** Siempre ≥ 0. '0.00' = el saldo cuadra y no hace falta ajuste. */
  diferencia: string;
  sentido: SentidoAjuste | null;
}

export interface NuevoAjuste {
  cuenta: string;
  /** Saldo real tal como lo escribe el usuario, ya normalizado ('-20.00', '1258.50'). */
  saldoReal: string;
  nota: string;
  /** Concepto en el idioma de la interfaz (lo genera la app). */
  concepto: string;
}

export const sqlApi = api.injectEndpoints({
  endpoints: (b) => ({
    /** Chips: número y total de cada tipo con los filtros activos (sin el de tipo). */
    movimientosTotalesTipo: b.query<TotalTipo[], Filtros>({
      queryFn: (f) =>
        capturar(() => filas<TotalTipo>(supabase.rpc('totales_por_tipo', argsFiltros(f)).select('tipo, n, total::text'))),
      providesTags: ['Movimientos'],
    }),

    /** Subtotal de cada día de la lista (cabeceras «21 oct · −51,57 €»). */
    movimientosSubtotalesDia: b.query<SubtotalDia[], Filtros>({
      queryFn: (f) =>
        capturar(() =>
          filas<SubtotalDia>(
            supabase.rpc('subtotales_por_dia', { ...argsFiltros(f), p_tipo: f.tipo }).select('fecha, n, balance::text'),
          ),
        ),
      providesTags: ['Movimientos'],
    }),

    /** Resumen del filtro activo (panel de escritorio sin selección). */
    movimientosResumenFiltro: b.query<ResumenFiltro | null, Filtros>({
      queryFn: (f) =>
        capturar(async () => {
          const r = await filas<ResumenFiltro>(
            supabase
              .rpc('resumen_filtro', { ...argsFiltros(f), p_tipo: f.tipo })
              .select(
                'n, ingresos::text, gastos_netos::text, balance::text, ajustes::text, dias, gasto_medio_diario::text, categoria_id, categoria_gasto::text',
              ),
          );
          return 'error' in r ? r : { data: r.data[0] ?? null };
        }),
      providesTags: ['Movimientos'],
    }),

    /** Categoría más usada para un concepto según el historial (null si no hay). */
    movimientosSugerirCategoria: b.query<string | null, { concepto: string; tipo: 'gasto' | 'ingreso' }>({
      queryFn: ({ concepto, tipo }) =>
        capturar(async () => {
          const { data, error } = await supabase.rpc('sugerir_categoria', { p_concepto: concepto, p_tipo: tipo });
          if (error) return { error: aErrorApi(error) };
          return { data: esUuid(data) ? data : null };
        }),
      providesTags: ['Movimientos'],
    }),

    /** Ids de las categorías de un tipo, las más usadas primero. */
    movimientosCategoriasUsadas: b.query<string[], 'gasto' | 'ingreso'>({
      queryFn: (tipo) =>
        capturar(async () => {
          const r = await filas<{ categoria_id: string }>(
            supabase.rpc('categorias_mas_usadas', { p_tipo: tipo }).select('categoria_id'),
          );
          return 'error' in r ? r : { data: r.data.map((f) => f.categoria_id) };
        }),
      providesTags: ['Movimientos', 'Categorias'],
    }),

    /**
     * Gastos con algo por devolver, para el «Gasto original» de una devolución.
     * `excluir`: la devolución que se está editando (no cuenta contra sí misma).
     */
    movimientosGastosDevolvibles: b.query<GastoDevolvible[], { excluir: string | null }>({
      queryFn: ({ excluir }) =>
        capturar(() =>
          filas<GastoDevolvible>(
            supabase
              .rpc('gastos_devolvibles', { p_excluir: excluir, p_limite: 50 })
              .select('id, fecha, concepto, importe::text, pendiente::text, categoria_id, cuenta_id'),
          ),
        ),
      providesTags: ['Movimientos'],
    }),

    /** Diferencia entre el saldo real y el de la app (la calcula la base). */
    movimientosCalcularAjuste: b.query<CalculoAjuste | null, { cuenta: string; saldoReal: string }>({
      queryFn: ({ cuenta, saldoReal }) =>
        capturar(async () => {
          const r = await filas<CalculoAjuste>(
            supabase
              .rpc('calcular_ajuste', { p_cuenta: cuenta, p_saldo_real: saldoReal })
              .select('saldo_app::text, saldo_real::text, diferencia::text, sentido'),
          );
          return 'error' in r ? r : { data: r.data[0] ?? null };
        }),
      providesTags: ['Movimientos', 'Cuentas'],
    }),

    /** Crea el ajuste con la diferencia que calcula la base. id null = no hacía falta. */
    movimientosCrearAjuste: b.mutation<{ id: string | null; diferencia: string }, NuevoAjuste>({
      queryFn: (a) =>
        capturar(async () => {
          const r = await filas<{ id: string | null; diferencia: string }>(
            supabase
              .rpc('crear_ajuste', { p_cuenta: a.cuenta, p_saldo_real: a.saldoReal, p_nota: a.nota, p_concepto: a.concepto })
              .select('id, diferencia::text'),
          );
          if ('error' in r) return r;
          return { data: r.data[0] ?? { id: null, diferencia: '0.00' } };
        }),
      invalidatesTags: ['Movimientos', 'Cuentas', 'Resumen'],
    }),
  }),
});

export const {
  useMovimientosTotalesTipoQuery,
  useMovimientosSubtotalesDiaQuery,
  useMovimientosResumenFiltroQuery,
  useMovimientosSugerirCategoriaQuery,
  useMovimientosCategoriasUsadasQuery,
  useMovimientosGastosDevolviblesQuery,
  useMovimientosCalcularAjusteQuery,
  useMovimientosCrearAjusteMutation,
} = sqlApi;
