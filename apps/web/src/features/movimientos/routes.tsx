import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaMovimientos = lazy(() => import('./pages/PaginaMovimientos'));
const PaginaNuevoMovimiento = lazy(() => import('./pages/PaginaNuevoMovimiento'));
const PaginaDetalleMovimiento = lazy(() => import('./pages/PaginaDetalleMovimiento'));

/** Rutas de la feature «movimientos». Solo esta feature edita este fichero. */
const rutas: RutasFeature = {
  app: [
    {
      path: 'movimientos',
      children: [
        { index: true, element: <PaginaMovimientos /> },
        { path: 'nuevo', element: <PaginaNuevoMovimiento /> },
        { path: ':id', element: <PaginaDetalleMovimiento /> },
      ],
    },
  ],
};

export default rutas;
