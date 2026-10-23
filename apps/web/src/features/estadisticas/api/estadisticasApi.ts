import { z } from 'zod';
import { api, aErrorApi, type ErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';
import type { FilaDia, FilaIngresoCategoria } from '../lib/agregaciones';
import type { Rango } from '../lib/periodos';

/*
 * Datos de Estadísticas. PostgREST devuelve `numeric` como número JSON: todos los importes se
 * piden con `::text`, también en las funciones que devuelven tabla, y se validan con zod
 * (si llegara un número en lugar de un string, la respuesta se rechaza). Todas las sumas,
 * medias y porcentajes salen de SQL.
 */

const importe = z.string().regex(/^-?\d+(\.\d+)?$/);

const esquemaResumen = z.object({
  ingresos: importe,
  gastos: importe,
  devoluciones: importe,
  gastos_netos: importe,
  balance: importe,
  ahorro_pct: importe.nullable(),
  ajustes: importe,
});
export type ResumenPeriodo = z.infer<typeof esquemaResumen>;

const esquemaResumenMes = esquemaResumen.extend({ mes: z.string().regex(/^\d{4}-\d{2}-01$/) });
export type ResumenMes = z.infer<typeof esquemaResumenMes>;

const esquemaCategoria = z.object({
  categoria_id: z.string(),
  nombre: z.string(),
  color: z.string(),
  gasto: importe,
});
export type GastoCategoria = z.infer<typeof esquemaCategoria>;

export const METODOS = ['tarjeta', 'apple_pay', 'efectivo', 'transferencia', 'bizum', 'domiciliacion'] as const;
const esquemaMetodo = z.object({ metodo: z.enum(METODOS).nullable(), gasto: importe });
export type GastoMetodo = z.infer<typeof esquemaMetodo>;

const esquemaMovimientoDia = z.object({
  id: z.string(),
  tipo: z.enum(['gasto', 'devolucion', 'ingreso']),
  concepto: z.string(),
  importe,
});

const esquemaDia = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gastos: importe,
  devoluciones: importe,
  gasto_neto: importe,
  ingresos: importe,
  movimientos: z.array(esquemaMovimientoDia),
}) satisfies z.ZodType<FilaDia>;

const esquemaIngresoCategoria = z.object({
  categoria_id: z.string(),
  nombre: z.string(),
  color: z.string(),
  ingreso: importe,
}) satisfies z.ZodType<FilaIngresoCategoria>;

const esquemaComparativa = z.object({
  gastos_netos: importe,
  gastos_netos_anterior: importe.nullable(),
  variacion_gastos: importe.nullable(),
  ingresos: importe,
  ingresos_anterior: importe.nullable(),
  variacion_ingresos: importe.nullable(),
  balance: importe,
  balance_anterior: importe.nullable(),
  variacion_balance: importe.nullable(),
  dias: z.number().int().positive(),
  gasto_medio_diario: importe,
  mayor_concepto: z.string().nullable(),
  mayor_importe: importe.nullable(),
});
export type Comparativa = z.infer<typeof esquemaComparativa>;

const esquemaFueraBalance = z.object({
  tipo: z.enum(['traspaso', 'ajuste']),
  cuenta: z.string(),
  cuenta_destino: z.string().nullable(),
  sentido: z.enum(['suma', 'resta']).nullable(),
  importe,
});
export type FilaFueraBalance = z.infer<typeof esquemaFueraBalance>;

const COLUMNAS_RESUMEN =
  'ingresos::text, gastos::text, devoluciones::text, gastos_netos::text, balance::text, ahorro_pct::text, ajustes::text';

const COLUMNAS_COMPARATIVA =
  'gastos_netos::text, gastos_netos_anterior::text, variacion_gastos::text, ingresos::text, ingresos_anterior::text, ' +
  'variacion_ingresos::text, balance::text, balance_anterior::text, variacion_balance::text, dias, ' +
  'gasto_medio_diario::text, mayor_concepto, mayor_importe::text';

type Resultado<T> = { data: T } | { error: ErrorApi };

/** Ejecuta la consulta y valida la respuesta con zod. Respuesta inesperada → error genérico. */
async function validar<T>(consulta: PromiseLike<{ data: unknown; error: unknown }>, esquema: z.ZodType<T>): Promise<Resultado<T>> {
  try {
    const { data, error } = await consulta;
    if (error !== null && error !== undefined) return { error: aErrorApi(error) };
    const r = esquema.safeParse(data);
    return r.success ? { data: r.data } : { error: { codigo: 'respuesta_invalida' } };
  } catch (e) {
    return { error: aErrorApi(e) };
  }
}

const p = (r: Rango) => ({ p_desde: r.desde, p_hasta: r.hasta });

/** Tramo actual y el mismo tramo del mes anterior (null = no existe, sección 8). */
export interface TramosComparacion {
  actual: Rango;
  anterior: Rango | null;
}

export const estadisticasApi = api.injectEndpoints({
  endpoints: (b) => ({
    /** Balance de un tramo (sección 3). */
    estadisticasResumenPeriodo: b.query<ResumenPeriodo, Rango>({
      queryFn: (r) =>
        validar(supabase.rpc('resumen_periodo', p(r)).select(COLUMNAS_RESUMEN).single(), esquemaResumen),
      providesTags: ['Resumen'],
    }),

    /** Un resumen por mes natural (meses sin movimientos salen a 0). */
    estadisticasResumenMensual: b.query<ResumenMes[], Rango>({
      queryFn: (r) =>
        validar(
          supabase.rpc('resumen_mensual', p(r)).select(`mes, ${COLUMNAS_RESUMEN}`).order('mes'),
          z.array(esquemaResumenMes),
        ),
      providesTags: ['Resumen'],
    }),

    /** Gasto neto por categoría (gastos − devoluciones); puede ser negativo. */
    estadisticasGastoPorCategoria: b.query<GastoCategoria[], Rango>({
      queryFn: (r) =>
        validar(
          supabase.rpc('gasto_por_categoria', p(r)).select('categoria_id, nombre, color, gasto::text'),
          z.array(esquemaCategoria),
        ),
      providesTags: ['Resumen', 'Categorias'],
    }),

    /** Gasto por método de pago: solo gastos; las devoluciones no restan aquí. */
    estadisticasGastoPorMetodo: b.query<GastoMetodo[], Rango>({
      queryFn: (r) =>
        validar(supabase.rpc('gasto_por_metodo', p(r)).select('metodo, gasto::text'), z.array(esquemaMetodo)),
      providesTags: ['Resumen'],
    }),

    /** Por día: gastos, devoluciones, gasto neto, ingresos y la lista de esos movimientos (SQL). */
    estadisticasMovimientosPorDia: b.query<FilaDia[], Rango>({
      queryFn: (r) =>
        validar(
          supabase
            .rpc('movimientos_por_dia', p(r))
            .select('fecha, gastos::text, devoluciones::text, gasto_neto::text, ingresos::text, movimientos'),
          z.array(esquemaDia),
        ),
      providesTags: ['Resumen', 'Movimientos'],
    }),

    /** Ingresos por categoría de ingreso, agregados en SQL. */
    estadisticasIngresosPorCategoria: b.query<FilaIngresoCategoria[], Rango>({
      queryFn: (r) =>
        validar(
          supabase.rpc('ingresos_por_categoria', p(r)).select('categoria_id, nombre, color, ingreso::text'),
          z.array(esquemaIngresoCategoria),
        ),
      providesTags: ['Resumen', 'Movimientos', 'Categorias'],
    }),

    /** Tramo contra el mismo tramo del mes anterior: totales, variaciones, gasto medio y mayor gasto. */
    estadisticasComparativa: b.query<Comparativa, TramosComparacion>({
      queryFn: ({ actual, anterior }) =>
        validar(
          supabase
            .rpc('comparativa_estadisticas', {
              ...p(actual),
              ...(anterior !== null && { p_desde_ant: anterior.desde, p_hasta_ant: anterior.hasta }),
            })
            .select(COLUMNAS_COMPARATIVA)
            .single(),
          esquemaComparativa,
        ),
      providesTags: ['Resumen', 'Movimientos'],
    }),

    /** Traspasos y ajustes del tramo: se muestran aparte, nunca en el balance. */
    estadisticasFueraDelBalance: b.query<FilaFueraBalance[], Rango>({
      queryFn: (r) =>
        validar(
          supabase
            .rpc('fuera_del_balance', p(r))
            .select('tipo, cuenta, cuenta_destino, sentido, importe::text'),
          z.array(esquemaFueraBalance),
        ),
      providesTags: ['Resumen', 'Movimientos', 'Cuentas'],
    }),
  }),
});

export const {
  useEstadisticasResumenPeriodoQuery,
  useEstadisticasResumenMensualQuery,
  useEstadisticasGastoPorCategoriaQuery,
  useEstadisticasGastoPorMetodoQuery,
  useEstadisticasMovimientosPorDiaQuery,
  useEstadisticasIngresosPorCategoriaQuery,
  useEstadisticasComparativaQuery,
  useEstadisticasFueraDelBalanceQuery,
} = estadisticasApi;
