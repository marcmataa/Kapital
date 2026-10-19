import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaEstadisticas = lazy(() => import('./pages/PaginaEstadisticas'));

/** Rutas de la feature «estadisticas». Solo esta feature edita este fichero. */
const rutas: RutasFeature = {
  app: [{ path: 'estadisticas', element: <PaginaEstadisticas /> }],
};

export default rutas;
