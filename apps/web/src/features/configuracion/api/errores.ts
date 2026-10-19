import type { ErrorApi } from '@/app/api';
import type { ClaveDe } from '@/shared/i18n';

type Clave = ClaveDe<'configuracion'>;

function codigoDe(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'codigo' in error) {
    const { codigo } = error as ErrorApi;
    return typeof codigo === 'string' ? codigo : 'desconocido';
  }
  return 'desconocido';
}

/**
 * Error de una mutación → clave de texto. Nunca se muestra el mensaje de la base.
 * `porCodigo` traduce los códigos de PostgreSQL propios de cada acción ('23505', '23514'…).
 */
export function claveError(error: unknown, porCodigo: Partial<Record<string, Clave>> = {}): Clave {
  const codigo = codigoDe(error);
  if (codigo === 'red') return 'error.red';
  return porCodigo[codigo] ?? 'error.generico';
}
