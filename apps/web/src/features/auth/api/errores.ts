import type { ClaveDe } from '@/shared/i18n';

export type ClaveErrorAuth = Extract<ClaveDe<'auth'>, `error.${string}`>;
export type ContextoAuth = 'login' | 'registro' | 'recuperar' | 'restablecer';

interface ErrorAuthLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
}

/**
 * Error de Supabase Auth → clave de texto genérica. Nunca se muestra el mensaje del proveedor
 * y no se distingue «no existe el usuario» de «contraseña incorrecta» (sin enumeración).
 */
export function claveErrorAuth(error: unknown, contexto: ContextoAuth): ClaveErrorAuth {
  if (error instanceof TypeError) return 'error.red';
  const e: ErrorAuthLike = typeof error === 'object' && error !== null ? error : {};
  const codigo = typeof e.code === 'string' ? e.code : '';
  const mensaje = typeof e.message === 'string' ? e.message : '';

  if (e.name === 'AuthRetryableFetchError') return 'error.red';
  if (e.status === 429 || codigo.startsWith('over_') || codigo.endsWith('_rate_limit')) return 'error.demasiadosIntentos';
  // El trigger de registro restringido rechaza el alta y GoTrue lo devuelve así.
  if (mensaje.includes('Database error saving new user') || codigo === 'signup_disabled') return 'error.registroCerrado';
  if (codigo === 'weak_password') return 'error.passwordDebil';
  if (codigo === 'same_password') return 'error.mismaPassword';
  if (contexto === 'login') return 'error.credenciales';
  return 'error.generico';
}
