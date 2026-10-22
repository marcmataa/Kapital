import type { FilaAnalisis } from '../schemas/esquemas';

/** Un «pendiente»/«generando» sin cambios en más de 15 minutos se considera atascado. */
export const MINUTOS_ATASCADO = 15;
/** La Edge Function deja de reintentar a los 3 intentos fallidos. */
export const MAXIMO_INTENTOS = 3;

/**
 * Qué se puede hacer con un análisis existente (contrato de la Edge Function en modo usuario):
 * - `regenerar`: está listo y no se ha regenerado → «Regenerar (1 disponible)» (consume la única).
 * - `agotado`: está listo y ya se regeneró.
 * - `reintentar`: falló (con intentos < 3) o lleva atascado más de 15 min → «Reintentar» (no consume).
 * - `sin_reintentos`: falló y ya no quedan reintentos.
 * - `esperar`: se está generando ahora mismo.
 */
export type AccionAnalisis = 'regenerar' | 'agotado' | 'reintentar' | 'sin_reintentos' | 'esperar';

export function estaAtascado(fila: Pick<FilaAnalisis, 'estado' | 'updated_at'>, ahoraMs: number): boolean {
  if (fila.estado !== 'pendiente' && fila.estado !== 'generando') return false;
  const cambio = Date.parse(fila.updated_at);
  // Fecha ilegible: no se puede saber si está atascado; se espera (el servidor decide igualmente).
  if (Number.isNaN(cambio)) return false;
  return ahoraMs - cambio > MINUTOS_ATASCADO * 60_000;
}

export function accionAnalisis(
  fila: Pick<FilaAnalisis, 'estado' | 'updated_at' | 'regeneraciones' | 'intentos'>,
  ahoraMs: number,
): AccionAnalisis {
  switch (fila.estado) {
    case 'listo':
      return fila.regeneraciones >= 1 ? 'agotado' : 'regenerar';
    case 'error':
      return fila.intentos >= MAXIMO_INTENTOS ? 'sin_reintentos' : 'reintentar';
    default:
      return estaAtascado(fila, ahoraMs) ? 'reintentar' : 'esperar';
  }
}
