import { api, aErrorApi, ejecutar, type ErrorApi } from '@/app/api';
import type { Idioma } from '@/shared/i18n';
import { supabase } from '@/shared/lib/supabase';
import type { Database } from '@db/database.types';

/*
 * Datos de Configuración. Las listas de cuentas, categorías y objetivos vienen de
 * `shared/api/catalogos.ts`; aquí solo están las escrituras propias de esta pantalla y los
 * tokens del atajo.
 *
 * El token en claro NUNCA pasa por aquí: se crea con `crearToken` (api/tokens.ts), que llama a
 * Supabase directamente para que el valor no quede en la caché de RTK Query.
 */

type TipoCategoria = Database['public']['Enums']['tipo_categoria'];

/** Fila de tokens_api SIN `token_hash` (nunca se pide). */
export interface TokenApi {
  id: string;
  nombre: string;
  revocado: boolean;
  ultimo_uso: string | null;
  created_at: string;
}

/** Columnas que se piden de tokens_api. `token_hash` no está a propósito. */
export const COLUMNAS_TOKENS = 'id, nombre, revocado, ultimo_uso, created_at';

export interface NuevoBanco {
  entidad: string | null;
  nombre: string;
  color: string | null;
  /** Saldo normalizado ('1258.50', '0.00'), salida de `parsearImporte`. */
  saldo: string;
}

export interface NuevaCategoria {
  nombre: string;
  tipo: TipoCategoria;
  color: string;
  icono: string | null;
  orden: number;
}

export interface CambiosCategoria {
  nombre?: string;
  color?: string;
  icono?: string | null;
  archivada?: boolean;
}

type Resultado<T> = { data: T } | { error: ErrorApi };

async function sinDatos(consulta: PromiseLike<{ error: unknown }>): Promise<Resultado<null>> {
  try {
    const { error } = await consulta;
    return error ? { error: aErrorApi(error) } : { data: null };
  } catch (e) {
    return { error: aErrorApi(e) };
  }
}

/**
 * Cambia la cuenta principal. El índice único parcial `cuentas_una_principal` impide tener dos a
 * la vez, así que primero se desmarca la actual y luego se marca la nueva. Son dos peticiones sin
 * transacción: si la segunda falla, se intenta volver a marcar la anterior para no quedarse sin
 * principal (el atajo la necesita). Si también eso falla, el usuario queda sin principal y la UI
 * avisa; lo arregla repitiendo la acción.
 */
export async function cambiarPrincipal(nuevaId: string, actualId: string | null): Promise<Resultado<null>> {
  if (actualId === nuevaId) return { data: null };
  if (actualId !== null) {
    const quitar = await sinDatos(supabase.from('cuentas').update({ es_principal: false }).eq('id', actualId));
    if ('error' in quitar) return quitar;
  }
  const poner = await sinDatos(supabase.from('cuentas').update({ es_principal: true }).eq('id', nuevaId));
  if ('error' in poner && actualId !== null) {
    await sinDatos(supabase.from('cuentas').update({ es_principal: true }).eq('id', actualId));
  }
  return poner;
}

export const configuracionApi = api.injectEndpoints({
  endpoints: (b) => ({
    /** Guarda el idioma en el perfil (el cambio en la interfaz lo hace `setIdioma`). */
    configActualizarIdioma: b.mutation<null, { userId: string; idioma: Idioma }>({
      queryFn: ({ userId, idioma }) => sinDatos(supabase.from('perfiles').update({ idioma }).eq('user_id', userId)),
      invalidatesTags: ['Perfil'],
    }),

    /** Alta de banco con saldo de hoy. 23514: límite de 5; 23505: nombre repetido; 22023: saldo no válido. */
    configCrearBanco: b.mutation<string, NuevoBanco>({
      queryFn: (banco) =>
        ejecutar(
          supabase.rpc('crear_banco', {
            p_entidad: banco.entidad,
            p_nombre: banco.nombre,
            p_color: banco.color,
            p_saldo: banco.saldo,
          }),
        ),
      invalidatesTags: ['Cuentas', 'Resumen'],
    }),

    configHacerPrincipal: b.mutation<null, { nuevaId: string; actualId: string | null }>({
      queryFn: ({ nuevaId, actualId }) => cambiarPrincipal(nuevaId, actualId),
      invalidatesTags: ['Cuentas'],
    }),

    /**
     * Cierra un banco con fecha `fecha` (hoy). La base comprueba que vale 0 ese día y que no tiene
     * movimientos posteriores (23514). Deja de ser principal para que `crear_banco` pueda marcar
     * el siguiente.
     */
    configCerrarBanco: b.mutation<null, { id: string; fecha: string }>({
      queryFn: ({ id, fecha }) =>
        sinDatos(supabase.from('cuentas').update({ fecha_cierre: fecha, es_principal: false }).eq('id', id)),
      invalidatesTags: ['Cuentas', 'Resumen'],
    }),

    /** 23505 si ya existe una categoría con ese nombre. */
    configCrearCategoria: b.mutation<null, NuevaCategoria>({
      queryFn: (c) =>
        sinDatos(
          supabase.from('categorias').insert({ nombre: c.nombre, tipo: c.tipo, color: c.color, icono: c.icono, orden: c.orden }),
        ),
      invalidatesTags: ['Categorias'],
    }),

    configActualizarCategoria: b.mutation<null, { id: string; cambios: CambiosCategoria }>({
      queryFn: ({ id, cambios }) => sinDatos(supabase.from('categorias').update(cambios).eq('id', id)),
      invalidatesTags: ['Categorias', 'Resumen'],
    }),

    /** Nuevo `orden` para varias categorías (solo las que cambian). */
    configReordenarCategorias: b.mutation<null, { id: string; orden: number }[]>({
      queryFn: async (cambios) => {
        const resultados = await Promise.all(
          cambios.map(({ id, orden }) => sinDatos(supabase.from('categorias').update({ orden }).eq('id', id))),
        );
        return resultados.find((r) => 'error' in r) ?? { data: null };
      },
      invalidatesTags: ['Categorias'],
    }),

    configListarTokens: b.query<TokenApi[], void>({
      queryFn: () =>
        ejecutar(supabase.from('tokens_api').select(COLUMNAS_TOKENS).order('created_at', { ascending: false })),
      providesTags: ['Tokens'],
    }),

    /** authenticated solo puede actualizar `revocado` y `nombre`. */
    configRevocarToken: b.mutation<null, string>({
      queryFn: (id) => sinDatos(supabase.from('tokens_api').update({ revocado: true }).eq('id', id)),
      invalidatesTags: ['Tokens'],
    }),
  }),
});

export const {
  useConfigActualizarIdiomaMutation,
  useConfigCrearBancoMutation,
  useConfigHacerPrincipalMutation,
  useConfigCerrarBancoMutation,
  useConfigCrearCategoriaMutation,
  useConfigActualizarCategoriaMutation,
  useConfigReordenarCategoriasMutation,
  useConfigListarTokensQuery,
  useConfigRevocarTokenMutation,
} = configuracionApi;
