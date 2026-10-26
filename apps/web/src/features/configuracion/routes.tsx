import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaConfiguracion = lazy(() => import('./pages/PaginaConfiguracion'));

/** Rutas de la feature «configuracion». Solo esta feature edita este fichero. */
const rutas: RutasFeature = {
  app: [
    {
      path: 'configuracion',
      // En el móvil cada sección (idioma, bancos, efectivo…) es su propia pantalla: /configuracion/:seccion.
      children: [
        { index: true, element: <PaginaConfiguracion /> },
        { path: ':seccion', element: <PaginaConfiguracion /> },
      ],
    },
  ],
};

export default rutas;
