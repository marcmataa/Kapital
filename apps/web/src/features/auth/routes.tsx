import { lazy } from 'react';
import type { RutasFeature } from '@/app/rutas';

const PaginaLogin = lazy(() => import('./pages/PaginaLogin'));
const PaginaRegistro = lazy(() => import('./pages/PaginaRegistro'));
const PaginaRecuperar = lazy(() => import('./pages/PaginaRecuperar'));
const PaginaRestablecer = lazy(() => import('./pages/PaginaRestablecer'));

/** Rutas de la feature «auth». */
const rutas: RutasFeature = {
  publicas: [
    { path: 'login', element: <PaginaLogin /> },
    { path: 'registro', element: <PaginaRegistro /> },
    { path: 'recuperar', element: <PaginaRecuperar /> },
  ],
  // Se llega desde el email con o sin sesión previa: la página decide.
  libres: [{ path: 'restablecer', element: <PaginaRestablecer /> }],
};

export default rutas;
