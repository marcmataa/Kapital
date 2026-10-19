import { createBrowserRouter, type RouteObject } from 'react-router';
import analisis from '@/features/analisis/routes';
import auth from '@/features/auth/routes';
import configuracion from '@/features/configuracion/routes';
import estadisticas from '@/features/estadisticas/routes';
import inicio from '@/features/inicio/routes';
import movimientos from '@/features/movimientos/routes';
import onboarding from '@/features/onboarding/routes';
import { AppLayout } from '@/shared/layout/AppLayout';
import { PaginaMas } from '@/shared/layout/PaginaMas';
import { PaginaNoEncontrada } from '@/shared/layout/PaginaNoEncontrada';
import { FallbackRuta } from '@/shared/layout/FallbackRuta';
import { OutletConCarga, PublicOnly, RequireAuth, RequireOnboarding } from './auth';
import type { RutasFeature } from './rutas';

const features: RutasFeature[] = [auth, onboarding, inicio, movimientos, estadisticas, analisis, configuracion];
const zona = (clave: keyof RutasFeature): RouteObject[] => features.flatMap((f) => f[clave] ?? []);

/** Árbol de rutas (también lo usan los tests con createMemoryRouter). */
export const rutas: RouteObject[] = [
  {
    element: <OutletConCarga />,
    errorElement: <FallbackRuta />,
    children: [
      { element: <PublicOnly />, children: zona('publicas') },
      ...zona('libres'),
      {
        element: <RequireAuth />,
        children: [
          { element: <RequireOnboarding requiere="pendiente" />, children: zona('onboarding') },
          {
            element: <RequireOnboarding requiere="completado" />,
            children: [
              {
                element: <AppLayout />,
                children: [...zona('app'), { path: 'mas', element: <PaginaMas /> }],
              },
            ],
          },
        ],
      },
      { path: '*', element: <PaginaNoEncontrada /> },
    ],
  },
];

export function crearRouter() {
  return createBrowserRouter(rutas);
}
