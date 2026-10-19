import type { RouteObject } from 'react-router';

/**
 * Contrato entre el router central y cada feature. `src/features/<f>/routes.tsx` exporta por
 * defecto un objeto de este tipo; el router lo monta en la zona que corresponde y nunca hay que
 * tocar `src/app/router.tsx` para añadir páginas.
 *
 * Paths RELATIVOS (sin '/' inicial). Las páginas, con React.lazy: la zona ya pone el Suspense.
 */
export interface RutasFeature {
  /** Solo sin sesión (login, registro…). Con sesión redirige a '/'. */
  publicas?: RouteObject[];
  /** Sin guard: accesibles con o sin sesión (p. ej. /restablecer desde el email). */
  libres?: RouteObject[];
  /** Con sesión y onboarding PENDIENTE (/bienvenida). */
  onboarding?: RouteObject[];
  /** Con sesión y onboarding completado, dentro del layout con sidebar / bottom nav. */
  app?: RouteObject[];
}
