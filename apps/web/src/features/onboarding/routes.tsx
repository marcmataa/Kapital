import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaBienvenida = lazy(() => import('./pages/PaginaBienvenida'));

/** Rutas de la feature «onboarding». Solo esta feature edita este fichero. */
const rutas: RutasFeature = {
  onboarding: [{ path: 'bienvenida', element: <PaginaBienvenida /> }],
};

export default rutas;
