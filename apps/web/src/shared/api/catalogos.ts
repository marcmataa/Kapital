import { api, ejecutar, aErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';
import type { Database } from '@db/database.types';

/*
 * Datos que usan varias features a la vez: cuentas, categorías y objetivos.
 *
 * IMPORTES: PostgREST devuelve `numeric` como número JSON (coma flotante en JS). Por eso
 * todo importe se pide con cast a texto en la consulta (`importe::text`) y viaja como
 * string. Para escribirlos se usa `aNumeric`, que pasa el string tal cual.
 */

type Enums = Database['public']['Enums'];

export interface Cuenta {
  id: string;
  nombre: string;
  /** 'efectivo' en la cuenta de efectivo por defecto (se muestra traducida); si no, null. Ver shared/lib/cuentas.ts. */
  clave?: string | null;
  tipo: Enums['tipo_cuenta'];
  entidad: string | null;
  color: string | null;
  emoji: string | null;
  es_principal: boolean;
  orden: number;
  fecha_inicial: string;
  fecha_cierre: string | null;
  saldo_inicial: string;
  /** Valor al cierre de hoy (null si la cuenta aún no existe hoy). */
  valor: string | null;
}

export type Categoria = Database['public']['Tables']['categorias']['Row'];

export interface Objetivo {
  id: string;
  tipo: Enums['tipo_objetivo'];
  categoria_id: string | null;
  importe: string;
}

export interface NuevoObjetivo {
  tipo: Enums['tipo_objetivo'];
  categoria_id: string | null;
  /** Importe normalizado ('150.00'), p. ej. salida de `parsearImporte`. */
  importe: string;
}

/**
 * PostgREST acepta texto para columnas `numeric` y la base lo convierte sin pasar por
 * coma flotante. El tipo generado dice `number`; este es el único sitio donde se adapta.
 */
export function aNumeric(importe: string): number {
  return importe as unknown as number;
}

export const catalogosApi = api.injectEndpoints({
  endpoints: (b) => ({
    /** Cuentas abiertas y cerradas, con su valor de hoy. Ordenadas por `orden`. */
    listarCuentas: b.query<Cuenta[], void>({
      queryFn: async () => {
        try {
          const [cuentas, saldos] = await Promise.all([
            supabase
              .from('cuentas')
              .select(
                'id, nombre, clave, tipo, entidad, color, emoji, es_principal, orden, fecha_inicial, fecha_cierre, saldo_inicial::text',
              )
              .order('orden'),
            supabase.from('v_saldos').select('id, valor::text'),
          ]);
          if (cuentas.error) return { error: aErrorApi(cuentas.error) };
          if (saldos.error) return { error: aErrorApi(saldos.error) };
          const valores = new Map(saldos.data.map((s) => [s.id, s.valor]));
          return { data: cuentas.data.map((c) => ({ ...c, valor: valores.get(c.id) ?? null })) };
        } catch (e) {
          return { error: aErrorApi(e) };
        }
      },
      providesTags: ['Cuentas'],
    }),

    listarCategorias: b.query<Categoria[], void>({
      queryFn: () => ejecutar(supabase.from('categorias').select('*').order('orden')),
      providesTags: ['Categorias'],
    }),

    /** Objetivos activos (los desactivados se conservan como historial). */
    listarObjetivos: b.query<Objetivo[], void>({
      queryFn: () =>
        ejecutar(
          supabase.from('objetivos').select('id, tipo, categoria_id, importe::text').eq('activo', true).order('created_at'),
        ),
      providesTags: ['Objetivos'],
    }),

    /** 23505 si ya hay un objetivo activo del mismo tipo (o de esa categoría). */
    crearObjetivo: b.mutation<null, NuevoObjetivo>({
      queryFn: (o) =>
        ejecutar(
          supabase
            .from('objetivos')
            .insert({ tipo: o.tipo, categoria_id: o.categoria_id, importe: aNumeric(o.importe) }),
        ),
      invalidatesTags: ['Objetivos'],
    }),

    actualizarImporteObjetivo: b.mutation<null, { id: string; importe: string }>({
      queryFn: ({ id, importe }) =>
        ejecutar(supabase.from('objetivos').update({ importe: aNumeric(importe) }).eq('id', id)),
      invalidatesTags: ['Objetivos'],
    }),

    desactivarObjetivo: b.mutation<null, string>({
      queryFn: (id) => ejecutar(supabase.from('objetivos').update({ activo: false }).eq('id', id)),
      invalidatesTags: ['Objetivos'],
    }),
  }),
});

export const {
  useListarCuentasQuery,
  useListarCategoriasQuery,
  useListarObjetivosQuery,
  useCrearObjetivoMutation,
  useActualizarImporteObjetivoMutation,
  useDesactivarObjetivoMutation,
} = catalogosApi;
