import { z } from 'zod';
import { api, aErrorApi, ejecutar, type ErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';
import type { Database } from '@db/database.types';

/*
 * Datos de Inicio. PostgREST devuelve `numeric` como número JSON (coma flotante): por eso
 * TODOS los importes se piden con cast a texto, también en las RPC que devuelven tabla
 * (`supabase.rpc(...).select('ingresos::text, ...')`). Nunca se usa `patrimonio()` escalar.
 */

type Enums = Database['public']['Enums'];

export interface Periodo {
  desde: string;
  hasta: string;
}

export interface ResumenPeriodo {
  ingresos: string;
  gastos_netos: string;
  balance: string;
  /** Balance / ingresos × 100 (SQL); null si los ingresos son 0 (se muestra «—»). */
  ahorro_pct: string | null;
}

export interface PuntoPatrimonio {
  fecha: string;
  patrimonio: string;
  provisional: boolean;
}

export interface ValorCuenta {
  cuenta_id: string;
  valor: string;
}

export interface GastoCategoria {
  categoria_id: string;
  nombre: string;
  color: string;
  gasto: string;
}

export interface IngresoCategoria {
  categoria_id: string;
  nombre: string;
  color: string;
  ingreso: string;
}

/** Fila de `progreso_objetivos`: lo que lleva cada objetivo en el mes en curso (SQL). */
export interface ProgresoObjetivo {
  objetivo_id: string;
  tipo: Enums['tipo_objetivo'];
  categoria_id: string | null;
  importe: string;
  actual: string;
  /** Límite: cuánto se ha pasado (null si no se ha pasado). */
  exceso: string | null;
  /** Ahorro: cuánto falta (null si ya se ha conseguido). */
  restante: string | null;
  /** Días que quedan del mes, hoy incluido. */
  dias_restantes: number;
  /** Ahorro: restante / días que quedan (null si ya se ha conseguido). */
  ahorro_diario_necesario: string | null;
}

/** Fila de `peso_otros_gastos` (0 o 1 filas). */
export interface PesoOtrosGastos {
  categoria_id: string;
  gasto: string;
  porcentaje: string;
  supera_umbral: boolean;
}

export interface MovimientoReciente {
  id: string;
  fecha: string;
  concepto: string;
  tipo: Enums['tipo_movimiento'];
  importe: string;
  sentido: Enums['sentido_ajuste'] | null;
  categoria: { nombre: string; clave: string | null; color: string } | null;
  cuenta: { nombre: string; clave: string | null } | null;
  destino: { nombre: string; clave: string | null } | null;
}

/**
 * Una recomendación es texto; también se acepta un objeto con `texto` (recomendación con acción
 * estructurada) para que Inicio no se rompa si el análisis cambia de forma.
 */
const esquemaRecomendacion = z.union([z.string(), z.object({ texto: z.string() }).transform((r) => r.texto)]);

const esquemaContenido = z.object({
  resumen: z.string(),
  destacados: z.array(z.string()),
  recomendaciones: z.array(esquemaRecomendacion),
  insights: z.array(z.string()).optional(),
});

export interface AnalisisReciente {
  /** Día 1 del mes analizado ('2026-09-01'). */
  mes: string;
  /**
   * Un consejo accionable del análisis, tal cual lo generó la IA (nada de texto generado aquí):
   * su primer insight si lo trae; si no, su primera recomendación; si tampoco, su primer destacado.
   */
  consejo: string | null;
}

export function consejoDe(contenido: z.infer<typeof esquemaContenido>): string | null {
  return contenido.insights?.[0] ?? contenido.recomendaciones[0] ?? contenido.destacados[0] ?? null;
}

export const SELECT_RESUMEN = 'ingresos::text, gastos_netos::text, balance::text, ahorro_pct::text';
export const SELECT_INGRESOS_CATEGORIAS = 'categoria_id, nombre, color, ingreso::text';
export const SELECT_PROGRESO_OBJETIVOS =
  'objetivo_id, tipo, categoria_id, importe::text, actual::text, exceso::text, restante::text, dias_restantes, ahorro_diario_necesario::text';
export const SELECT_PESO_OTROS = 'categoria_id, gasto::text, porcentaje::text, supera_umbral';
export const SELECT_SERIE = 'fecha, patrimonio::text, provisional';
export const SELECT_VALORES_CUENTAS = 'cuenta_id, valor::text';
export const SELECT_CATEGORIAS = 'categoria_id, nombre, color, gasto::text';
export const SELECT_MOVIMIENTOS =
  'id, fecha, concepto, tipo, importe::text, sentido, categoria:categorias!movimientos_categoria_id_user_id_fkey(nombre, clave, color), cuenta:cuentas!movimientos_cuenta_id_user_id_fkey(nombre, clave), destino:cuentas!movimientos_cuenta_destino_id_user_id_fkey(nombre, clave)';
export const SELECT_ANALISIS = 'mes, contenido';

const SIN_DATOS: ErrorApi = { codigo: 'sin_datos' };

export const inicioApi = api.injectEndpoints({
  endpoints: (b) => ({
    /** Balance de [desde, hasta] (reglas, sección 3). */
    inicioResumen: b.query<ResumenPeriodo, Periodo>({
      queryFn: async ({ desde, hasta }) => {
        try {
          const { data, error } = await supabase
            .rpc('resumen_periodo', { p_desde: desde, p_hasta: hasta })
            .select(SELECT_RESUMEN);
          if (error) return { error: aErrorApi(error) };
          const fila = data[0];
          return fila ? { data: fila } : { error: SIN_DATOS };
        } catch (e) {
          return { error: aErrorApi(e) };
        }
      },
      providesTags: ['Resumen', 'Movimientos'],
    }),

    /** Patrimonio al cierre de cada día (sección 7): sin días futuros ni anteriores a los datos. */
    inicioSeriePatrimonio: b.query<PuntoPatrimonio[], Periodo & { hoy: string }>({
      queryFn: ({ desde, hasta, hoy }) =>
        ejecutar(
          supabase
            .rpc('serie_patrimonio', { p_desde: desde, p_hasta: hasta, p_hoy: hoy })
            .select(SELECT_SERIE)
            .order('fecha'),
        ),
      providesTags: ['Resumen', 'Movimientos', 'Cuentas'],
    }),

    /**
     * Valor de cada cuenta al cierre de un día (secciones 4 y 6), para el desglose del patrimonio
     * de un mes cerrado. Solo cuentas que existían y seguían abiertas ese día.
     */
    inicioValoresCuentas: b.query<ValorCuenta[], string>({
      queryFn: (fecha) => ejecutar(supabase.rpc('valores_cuentas', { p_fecha: fecha }).select(SELECT_VALORES_CUENTAS)),
      providesTags: ['Resumen', 'Movimientos', 'Cuentas'],
    }),

    /** Gasto neto por categoría (sección 8). Puede haber importes negativos. */
    inicioGastoCategorias: b.query<GastoCategoria[], Periodo>({
      queryFn: ({ desde, hasta }) =>
        ejecutar(
          supabase
            .rpc('gasto_por_categoria', { p_desde: desde, p_hasta: hasta })
            .select(SELECT_CATEGORIAS),
        ),
      providesTags: ['Resumen', 'Movimientos', 'Categorias'],
    }),

    /** Ingresos por categoría de ingreso (sección 8), de mayor a menor (SQL). */
    inicioIngresosCategorias: b.query<IngresoCategoria[], Periodo>({
      queryFn: ({ desde, hasta }) =>
        ejecutar(
          supabase
            .rpc('ingresos_por_categoria', { p_desde: desde, p_hasta: hasta })
            .select(SELECT_INGRESOS_CATEGORIAS),
        ),
      providesTags: ['Resumen', 'Movimientos', 'Categorias'],
    }),

    /** Objetivos activos con su progreso del mes en curso, exceso y ahorro diario necesario (SQL). */
    inicioProgresoObjetivos: b.query<ProgresoObjetivo[], string>({
      queryFn: (hoy) =>
        ejecutar(supabase.rpc('progreso_objetivos', { p_hoy: hoy }).select(SELECT_PROGRESO_OBJETIVOS)),
      providesTags: ['Objetivos', 'Resumen', 'Movimientos', 'Categorias'],
    }),

    /** Peso de «Otros gastos» sobre el gasto del periodo y si supera el 20 % (SQL). */
    inicioPesoOtrosGastos: b.query<PesoOtrosGastos[], Periodo>({
      queryFn: ({ desde, hasta }) =>
        ejecutar(supabase.rpc('peso_otros_gastos', { p_desde: desde, p_hasta: hasta }).select(SELECT_PESO_OTROS)),
      providesTags: ['Resumen', 'Movimientos', 'Categorias'],
    }),

    /** Últimos 5 movimientos por fecha real (y hora de registro para desempatar). */
    inicioUltimosMovimientos: b.query<MovimientoReciente[], void>({
      queryFn: () =>
        ejecutar(
          supabase
            .from('movimientos')
            .select(SELECT_MOVIMIENTOS)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(5),
        ),
      providesTags: ['Movimientos', 'Cuentas', 'Categorias'],
    }),

    /** Último análisis listo (o null). El contenido se valida con zod; si no cuadra, se ignora. */
    inicioUltimoAnalisis: b.query<AnalisisReciente | null, void>({
      queryFn: async () => {
        try {
          const { data, error } = await supabase
            .from('analisis_mensuales')
            .select(SELECT_ANALISIS)
            .eq('estado', 'listo')
            .order('mes', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) return { error: aErrorApi(error) };
          if (data === null) return { data: null };
          const contenido = esquemaContenido.safeParse(data.contenido);
          if (!contenido.success) return { data: null };
          return { data: { mes: data.mes, consejo: consejoDe(contenido.data) } };
        } catch (e) {
          return { error: aErrorApi(e) };
        }
      },
      providesTags: ['Analisis'],
    }),

    /** Análisis listo de un mes cerrado ('YYYY-MM-01'), o null si no hay o su contenido no cuadra. */
    inicioAnalisisMes: b.query<AnalisisReciente | null, string>({
      queryFn: async (mes) => {
        try {
          const { data, error } = await supabase
            .from('analisis_mensuales')
            .select(SELECT_ANALISIS)
            .eq('estado', 'listo')
            .eq('mes', mes)
            .maybeSingle();
          if (error) return { error: aErrorApi(error) };
          if (data === null) return { data: null };
          const contenido = esquemaContenido.safeParse(data.contenido);
          if (!contenido.success) return { data: null };
          return { data: { mes: data.mes, consejo: consejoDe(contenido.data) } };
        } catch (e) {
          return { error: aErrorApi(e) };
        }
      },
      providesTags: (_r, _e, mes) => [{ type: 'Analisis', id: mes }, 'Analisis'],
    }),
  }),
});

export const {
  useInicioResumenQuery,
  useInicioSeriePatrimonioQuery,
  useInicioValoresCuentasQuery,
  useInicioGastoCategoriasQuery,
  useInicioIngresosCategoriasQuery,
  useInicioProgresoObjetivosQuery,
  useInicioPesoOtrosGastosQuery,
  useInicioUltimosMovimientosQuery,
  useInicioUltimoAnalisisQuery,
  useInicioAnalisisMesQuery,
} = inicioApi;
