import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaConfiguracion = lazy(() => import('./pages/PaginaConfiguracion'));

/** Rutas de la feature «configuracion». Solo esta feature edita este fichero. */
const rutas: RutasFeature = {
  app: [
    {
      path: 'configuracion',
      // Subrutas propias de configuración (idioma, bancos, categorías…) van en children.
      children: [{ index: true, element: <PaginaConfiguracion /> }],
    },
  ],
};

export default rutas;
