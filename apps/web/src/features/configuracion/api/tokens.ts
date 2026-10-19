import { aErrorApi, type ErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';

/**
 * Crea un token del atajo y lo devuelve UNA vez. Se llama a Supabase directamente (no es un
 * endpoint de RTK Query) para que el token en claro no quede guardado en la caché del store:
 * solo vive en el estado del diálogo que lo muestra, y se descarta al cerrarlo.
 * Nunca se registra en logs. Tras crearlo, quien llama invalida la etiqueta 'Tokens'.
 */
export async function crearToken(nombre: string): Promise<{ token: string } | { error: ErrorApi }> {
  try {
    const { data, error } = await supabase.rpc('crear_token', { p_nombre: nombre });
    if (error) return { error: aErrorApi(error) };
    if (typeof data !== 'string' || data === '') return { error: { codigo: 'desconocido' } };
    return { token: data };
  } catch (e) {
    return { error: aErrorApi(e) };
  }
}
