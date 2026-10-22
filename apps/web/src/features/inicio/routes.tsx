import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaInicio = lazy(() => import('./pages/PaginaInicio'));

/** Rutas de la feature «inicio». Solo esta feature edita este fichero. */
const rutas: RutasFeature = {
  app: [{ index: true, element: <PaginaInicio /> }],
};

export default rutas;
