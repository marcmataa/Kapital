import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaAnalisis = lazy(() => import('./pages/PaginaAnalisis'));
const PaginaAnalisisMes = lazy(() => import('./pages/PaginaAnalisisMes'));

/** Rutas de la feature «analisis». Solo esta feature edita este fichero. */
const rutas: RutasFeature = {
  app: [
    {
      path: 'analisis',
      children: [
        { index: true, element: <PaginaAnalisis /> },
        // :mes = 'YYYY-MM'
        { path: ':mes', element: <PaginaAnalisisMes /> },
      ],
    },
  ],
};

export default rutas;
