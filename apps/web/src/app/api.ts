import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';

/**
 * Error que devuelven los endpoints. Nunca se muestra `detalle` al usuario: la UI traduce `codigo`.
 * - codigo: código de PostgreSQL ('P0001', '23505'…), de Auth, o 'red' / 'desconocido'.
 * - mensaje: mensaje corto de la base cuando es un código propio (p. ej. 'limite_regeneracion').
 */
export interface ErrorApi {
  codigo: string;
  mensaje?: string;
}

interface ErrorConCodigo {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  name?: unknown;
}

/** Convierte cualquier error de supabase-js (Postgrest, Auth, Functions, red) en ErrorApi. */
export function aErrorApi(error: unknown): ErrorApi {
  if (error instanceof TypeError) return { codigo: 'red' };
  if (typeof error === 'object' && error !== null) {
    const e = error as ErrorConCodigo;
    if (e.name === 'AuthRetryableFetchError' || e.name === 'FunctionsFetchError') return { codigo: 'red' };
    const codigo = typeof e.code === 'string' && e.code !== '' ? e.code : 'desconocido';
    const mensaje = typeof e.message === 'string' && /^[a-z_]{3,60}$/.test(e.message) ? e.message : undefined;
    return mensaje === undefined ? { codigo } : { codigo, mensaje };
  }
  return { codigo: 'desconocido' };
}

type RespuestaSupabase<T> = { data: T; error: null } | { data: null; error: unknown };

/**
 * Adapta una consulta de supabase-js al formato de `queryFn`:
 *   queryFn: () => ejecutar(supabase.from('cuentas').select('*'))
 */
export async function ejecutar<T>(
  consulta: PromiseLike<RespuestaSupabase<T>>,
): Promise<{ data: T } | { error: ErrorApi }> {
  try {
    const { data, error } = await consulta;
    if (error !== null) return { error: aErrorApi(error) };
    return { data: data as T };
  } catch (e) {
    return { error: aErrorApi(e) };
  }
}

/**
 * API única de la app. Cada feature añade sus endpoints desde su carpeta `api/`:
 *   export const cuentasApi = api.injectEndpoints({ endpoints: (b) => ({ ... }) });
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery<ErrorApi>(),
  tagTypes: ['Perfil', 'Cuentas', 'Categorias', 'Movimientos', 'Resumen', 'Objetivos', 'Analisis', 'Tokens'],
  endpoints: () => ({}),
});
