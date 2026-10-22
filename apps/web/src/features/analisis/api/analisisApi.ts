import { z } from 'zod';
import { api, aErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';
import { codigoErrorFuncion } from '../lib/errores';
import {
  esquemaContenido,
  esquemaDatos,
  esquemaFila,
  type ContenidoAnalisis,
  type DatosAnalisis,
  type FilaAnalisis,
} from '../schemas/esquemas';

/** Columnas de la lista: nunca `datos` ni `contenido` (pesan y no hacen falta). */
export const COLUMNAS_LISTA = 'id, mes, estado, mes_incompleto, regeneraciones, intentos, generado_at, updated_at';

export interface AnalisisDetalle extends FilaAnalisis {
  /** Datos y contenido validados; null si faltan o no cumplen el contrato. */
  datos: DatosAnalisis | null;
  contenido: ContenidoAnalisis | null;
  /** true si la fila está «listo» pero sus datos o su contenido no son válidos. */
  invalido: boolean;
}

export const analisisApi = api.injectEndpoints({
  endpoints: (b) => ({
    /** Análisis del usuario (RLS), del más reciente al más antiguo. */
    analisisListar: b.query<FilaAnalisis[], void>({
      queryFn: async () => {
        try {
          const { data, error } = await supabase
            .from('analisis_mensuales')
            .select(COLUMNAS_LISTA)
            .order('mes', { ascending: false });
          if (error) return { error: aErrorApi(error) };
          const filas = z.array(esquemaFila).safeParse(data);
          return filas.success ? { data: filas.data } : { error: { codigo: 'respuesta_invalida' } };
        } catch (e) {
          return { error: aErrorApi(e) };
        }
      },
      providesTags: ['Analisis'],
    }),

    /** Análisis de un mes ('YYYY-MM-01'); null si aún no existe. */
    analisisObtener: b.query<AnalisisDetalle | null, string>({
      queryFn: async (mes) => {
        try {
          const { data, error } = await supabase
            .from('analisis_mensuales')
            .select(`${COLUMNAS_LISTA}, datos, contenido`)
            .eq('mes', mes)
            .maybeSingle();
          if (error) return { error: aErrorApi(error) };
          if (data === null) return { data: null };
          const fila = esquemaFila.safeParse(data);
          if (!fila.success) return { error: { codigo: 'respuesta_invalida' } };
          const datos = esquemaDatos.safeParse(data.datos);
          const contenido = esquemaContenido.safeParse(data.contenido);
          return {
            data: {
              ...fila.data,
              datos: datos.success ? datos.data : null,
              contenido: contenido.success ? contenido.data : null,
              invalido: fila.data.estado === 'listo' && (!datos.success || !contenido.success),
            },
          };
        } catch (e) {
          return { error: aErrorApi(e) };
        }
      },
      providesTags: (_r, _e, mes) => [{ type: 'Analisis', id: mes }, 'Analisis'],
    }),

    /**
     * Genera (primera vez), reintenta (estado error o atascado; no consume) o regenera (estado
     * listo; máx. 1) el análisis de un mes cerrado con la Edge Function. La función decide qué
     * hacer según el estado de la fila. Errores con código genérico: limite_regeneracion (429),
     * limite_reintentos (429), en_curso (409), generacion_fallida (502)…
     */
    analisisGenerar: b.mutation<null, string>({
      queryFn: async (mes) => {
        try {
          const { error } = await supabase.functions.invoke('analisis-mensual', { body: { mes } });
          if (error) return { error: { codigo: await codigoErrorFuncion(error) } };
          return { data: null };
        } catch (e) {
          return { error: { codigo: await codigoErrorFuncion(e) } };
        }
      },
      // También en error: la fila puede haber pasado a «error» o «generando».
      invalidatesTags: ['Analisis'],
    }),
  }),
});

export const { useAnalisisListarQuery, useAnalisisObtenerQuery, useAnalisisGenerarMutation } = analisisApi;
