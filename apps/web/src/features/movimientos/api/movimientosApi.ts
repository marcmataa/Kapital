import { api, aErrorApi, type ErrorApi } from '@/app/api';
import { aNumeric } from '@/shared/api/catalogos';
import { aCentimos, desdeCentimos } from '@/shared/lib/dinero';
import { supabase } from '@/shared/lib/supabase';
import { filtroBusqueda } from '../lib/busqueda';
import type { Filtros } from '../lib/filtros';
import { COLUMNAS_MOVIMIENTO, esUuid, type Movimiento } from '../lib/tipos';
import type { PayloadMovimiento } from '../schemas/movimiento';
import { clasificarErrorMovimiento } from './errores';

export const TAMANO_PAGINA = 50;

/** Última fila de una página: la siguiente empieza justo después (keyset, sin OFFSET). */
export interface Cursor {
  fecha: string;
  created_at: string;
  id: string;
}

export interface PaginaMovimientos {
  filas: Movimiento[];
  siguiente: Cursor | null;
}

/** Orden de la lista: el más reciente primero; empates por hora de registro y por id. */
export function filtroCursor(c: Cursor): string {
  // Los valores vienen de la base (fecha, timestamptz, uuid), no del usuario; aun así van entre comillas.
  const f = `"${c.fecha}"`;
  const t = `"${c.created_at}"`;
  const i = `"${c.id}"`;
  return `fecha.lt.${f},and(fecha.eq.${f},created_at.lt.${t}),and(fecha.eq.${f},created_at.eq.${t},id.lt.${i})`;
}

const CURSOR_VALIDO = {
  fecha: /^\d{4}-\d{2}-\d{2}$/,
  created_at: /^[0-9T:.+\- ]{10,40}$/,
};

function cursorDe(m: Movimiento): Cursor | null {
  if (!CURSOR_VALIDO.fecha.test(m.fecha) || !CURSOR_VALIDO.created_at.test(m.created_at) || !esUuid(m.id)) return null;
  return { fecha: m.fecha, created_at: m.created_at, id: m.id };
}

/** Consulta de una página con los filtros aplicados. Exportada para testear el SQL que se pide. */
export function consultaPagina(filtros: Filtros, cursor: Cursor | null) {
  let q = supabase.from('movimientos').select(COLUMNAS_MOVIMIENTO);
  const busqueda = filtroBusqueda(filtros.q);
  if (busqueda !== null) q = q.or(busqueda);
  if (filtros.tipo !== null) q = q.eq('tipo', filtros.tipo);
  if (filtros.desde !== null) q = q.gte('fecha', filtros.desde);
  if (filtros.hasta !== null) q = q.lte('fecha', filtros.hasta);
  if (filtros.categoria !== null && esUuid(filtros.categoria)) q = q.eq('categoria_id', filtros.categoria);
  if (filtros.metodo !== null) q = q.eq('metodo', filtros.metodo);
  if (filtros.cuenta !== null && esUuid(filtros.cuenta)) {
    q = q.or(`cuenta_id.eq.${filtros.cuenta},cuenta_destino_id.eq.${filtros.cuenta}`);
  }
  if (cursor !== null) q = q.or(filtroCursor(cursor));
  return q
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(TAMANO_PAGINA + 1);
}

type Resultado<T> = { data: T } | { error: ErrorApi };

async function capturar<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    return { error: aErrorApi(e) };
  }
}

/** Fila de PostgREST → Movimiento. `importe` ya llega como texto por el `::text`. */
function aMovimiento(fila: unknown): Movimiento {
  return fila as Movimiento;
}

export const movimientosApi = api.injectEndpoints({
  endpoints: (b) => ({
    movimientosListar: b.infiniteQuery<PaginaMovimientos, Filtros, Cursor | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (ultima) => ultima.siguiente,
      },
      queryFn: ({ queryArg, pageParam }) =>
        capturar(async () => {
          const { data, error } = await consultaPagina(queryArg, pageParam);
          if (error) return { error: aErrorApi(error) };
          const filas = (data as unknown[]).map(aMovimiento);
          const hayMas = filas.length > TAMANO_PAGINA;
          const pagina = hayMas ? filas.slice(0, TAMANO_PAGINA) : filas;
          const ultima = pagina[pagina.length - 1];
          return { data: { filas: pagina, siguiente: hayMas && ultima ? cursorDe(ultima) : null } };
        }),
      providesTags: ['Movimientos'],
    }),

    movimientosObtener: b.query<Movimiento | null, string>({
      queryFn: (id) =>
        capturar(async () => {
          if (!esUuid(id)) return { data: null };
          const { data, error } = await supabase
            .from('movimientos')
            .select(COLUMNAS_MOVIMIENTO)
            .eq('id', id)
            .maybeSingle();
          if (error) return { error: aErrorApi(error) };
          return { data: data === null ? null : aMovimiento(data) };
        }),
      providesTags: ['Movimientos'],
    }),

    /** Suma de las devoluciones vinculadas a un gasto ('0.00' si no hay). */
    movimientosDevuelto: b.query<string, string>({
      queryFn: (id) =>
        capturar(async () => {
          const { data, error } = await supabase
            .from('movimientos')
            .select('importe::text')
            .eq('devolucion_de', id);
          if (error) return { error: aErrorApi(error) };
          const filas = data as unknown as { importe: string }[];
          return { data: desdeCentimos(filas.reduce((s, f) => s + aCentimos(f.importe), 0n)) };
        }),
      providesTags: ['Movimientos'],
    }),

    movimientosCrear: b.mutation<string, PayloadMovimiento>({
      queryFn: (payload) =>
        capturar(async () => {
          const { data, error } = await supabase
            .from('movimientos')
            .insert({ ...payload, importe: aNumeric(payload.importe), origen: 'app' })
            .select('id')
            .single();
          if (error) return { error: clasificarErrorMovimiento(error) };
          return { data: data.id };
        }),
      invalidatesTags: ['Movimientos', 'Cuentas', 'Resumen', 'Objetivos'],
    }),

    movimientosActualizar: b.mutation<null, { id: string; payload: PayloadMovimiento }>({
      queryFn: ({ id, payload }) =>
        capturar(async () => {
          const { data, error } = await supabase
            .from('movimientos')
            .update({ ...payload, importe: aNumeric(payload.importe) })
            .eq('id', id)
            .select('id');
          if (error) return { error: clasificarErrorMovimiento(error) };
          if (data.length === 0) return { error: { codigo: 'PGRST116', mensaje: 'no_encontrado' } };
          return { data: null };
        }),
      invalidatesTags: ['Movimientos', 'Cuentas', 'Resumen', 'Objetivos'],
    }),

    movimientosBorrar: b.mutation<null, string>({
      queryFn: (id) =>
        capturar(async () => {
          const { data, error } = await supabase.from('movimientos').delete().eq('id', id).select('id');
          if (error) return { error: clasificarErrorMovimiento(error) };
          if (data.length === 0) return { error: { codigo: 'PGRST116', mensaje: 'no_encontrado' } };
          return { data: null };
        }),
      invalidatesTags: ['Movimientos', 'Cuentas', 'Resumen', 'Objetivos'],
    }),
  }),
});

export const {
  useMovimientosListarInfiniteQuery,
  useMovimientosObtenerQuery,
  useMovimientosDevueltoQuery,
  useMovimientosCrearMutation,
  useMovimientosActualizarMutation,
  useMovimientosBorrarMutation,
} = movimientosApi;
