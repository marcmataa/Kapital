import { z } from 'zod';
import { api, aErrorApi, type ErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';
import type { MovimientoLigero } from '../lib/agregaciones';
import type { Rango } from '../lib/periodos';

/*
 * Datos de Estadísticas. PostgREST devuelve `numeric` como número JSON: todos los importes se
 * piden con `::text`, también en las funciones que devuelven tabla, y se validan con zod
 * (si llegara un número en lugar de un string, la respuesta se rechaza).
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

const esquemaVariacion = z.object({
  patrimonio_inicial: importe,
  patrimonio_final: importe,
  balance: importe,
  revalorizacion: importe,
  ajustes: importe,
  saldos_iniciales: importe,
  variacion: importe,
});
export type VariacionPatrimonial = z.infer<typeof esquemaVariacion>;

const esquemaMovimiento = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(['gasto', 'ingreso', 'devolucion', 'traspaso', 'ajuste']),
  importe,
  categoria_id: z.string().nullable(),
});

const COLUMNAS_RESUMEN =
  'ingresos::text, gastos::text, devoluciones::text, gastos_netos::text, balance::text, ahorro_pct::text, ajustes::text';

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
      providesTags: ['Resumen'],
    }),

    /** Gasto por método de pago: solo gastos; las devoluciones no restan aquí. */
    estadisticasGastoPorMetodo: b.query<GastoMetodo[], Rango>({
      queryFn: (r) =>
        validar(supabase.rpc('gasto_por_metodo', p(r)).select('metodo, gasto::text'), z.array(esquemaMetodo)),
      providesTags: ['Resumen'],
    }),

    /** Variación patrimonial entre el cierre de d1 y el de d2 (sección 5). */
    estadisticasVariacion: b.query<VariacionPatrimonial, { d1: string; d2: string }>({
      queryFn: ({ d1, d2 }) =>
        validar(
          supabase
            .rpc('variacion_patrimonial', { p_d1: d1, p_d2: d2 })
            .select(
              'patrimonio_inicial::text, patrimonio_final::text, balance::text, revalorizacion::text, ajustes::text, saldos_iniciales::text, variacion::text',
            )
            .single(),
          esquemaVariacion,
        ),
      providesTags: ['Resumen'],
    }),

    /**
     * Movimientos del tramo que cuentan en el balance (gasto, devolución, ingreso), solo con los
     * campos necesarios para agregarlos por día o por categoría de ingreso.
     */
    estadisticasMovimientos: b.query<MovimientoLigero[], Rango>({
      queryFn: (r) =>
        validar(
          supabase
            .from('movimientos')
            .select('fecha, tipo, importe::text, categoria_id')
            .gte('fecha', r.desde)
            .lte('fecha', r.hasta)
            .in('tipo', ['gasto', 'devolucion', 'ingreso'])
            .order('fecha'),
          z.array(esquemaMovimiento),
        ),
      providesTags: ['Movimientos'],
    }),
  }),
});

export const {
  useEstadisticasResumenPeriodoQuery,
  useEstadisticasResumenMensualQuery,
  useEstadisticasGastoPorCategoriaQuery,
  useEstadisticasGastoPorMetodoQuery,
  useEstadisticasVariacionQuery,
  useEstadisticasMovimientosQuery,
} = estadisticasApi;
