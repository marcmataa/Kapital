import { supabase } from '@/shared/lib/supabase';

/**
 * Llamada a la Edge Function `eliminar-cuenta`. El servidor decide a quién borra (el usuario del
 * JWT); el cliente solo manda su email escrito a mano como confirmación.
 */
export type ResultadoEliminar =
  | { ok: true }
  | { ok: false; codigo: 'reautenticacion_requerida' | 'confirmacion_invalida' | 'no_autenticado' | 'red' | 'generico' };

const CONOCIDOS = ['reautenticacion_requerida', 'confirmacion_invalida', 'no_autenticado'] as const;

async function codigoDe(error: unknown): Promise<Exclude<ResultadoEliminar, { ok: true }>['codigo']> {
  if (error instanceof TypeError) return 'red';
  if (typeof error !== 'object' || error === null) return 'generico';
  const e = error as { name?: unknown; context?: unknown };
  if (e.name === 'FunctionsFetchError') return 'red';
  const respuesta = e.context;
  if (respuesta instanceof Response) {
    try {
      const cuerpo: unknown = await respuesta.clone().json();
      const codigo = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { error?: unknown }).error : undefined;
      const conocido = CONOCIDOS.find((c) => c === codigo);
      if (conocido) return conocido;
    } catch {
      // Cuerpo ilegible: se decide por el estado.
    }
    if (respuesta.status === 401) return 'no_autenticado';
    if (respuesta.status === 403) return 'reautenticacion_requerida';
  }
  return 'generico';
}

export async function eliminarCuenta(confirmacion: string): Promise<ResultadoEliminar> {
  try {
    const { error } = await supabase.functions.invoke('eliminar-cuenta', { body: { confirmacion } });
    if (error) return { ok: false, codigo: await codigoDe(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, codigo: await codigoDe(e) };
  }
}

/** ¿Lo escrito coincide con el email de la cuenta? (igual que el servidor: sin espacios ni mayúsculas). */
export function confirmacionValida(escrito: string, email: string | undefined | null): boolean {
  if (!email) return false;
  return escrito.trim().toLowerCase() === email.trim().toLowerCase();
}
