import { createMemoryRouter, RouterProvider } from 'react-router';
import { render, screen, within } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Proveedores, sesionFalsa } from '@/test/render';
import { rutas } from './router';

const perfil = vi.hoisted(() => ({ actual: null as Record<string, unknown> | null }));

vi.mock('@/shared/lib/supabase', () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: () => Promise.resolve({ data: perfil.actual, error: null }),
  };
  return { supabase: { from: () => consulta, auth: {} } };
});

function montar(ruta: string, sesion: Session | null) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(
    <Proveedores sesion={sesion}>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  return router;
}

const perfilCon = (onboarding: boolean, idioma = 'es') => ({
  user_id: '00000000-0000-0000-0000-000000000001',
  idioma,
  zona_horaria: 'Europe/Madrid',
  onboarding_completado: onboarding,
  created_at: '2026-10-01T00:00:00Z',
});

beforeEach(() => {
  perfil.actual = null;
});

describe('router y guards', () => {
  it('sin sesión, la app manda a /login', async () => {
    const router = montar('/movimientos', null);
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('con sesión, /login vuelve a la app', async () => {
    perfil.actual = perfilCon(true);
    const router = montar('/login', sesionFalsa());
    expect(await screen.findByRole('heading', { name: 'Hola' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('onboarding pendiente → /bienvenida', async () => {
    perfil.actual = perfilCon(false);
    const router = montar('/estadisticas', sesionFalsa());
    expect(await screen.findByRole('heading', { name: 'Bienvenido a Kapital' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/bienvenida');
  });

  it('sin fila de perfil también es onboarding pendiente', async () => {
    const router = montar('/', sesionFalsa());
    await screen.findByRole('heading', { name: 'Bienvenido a Kapital' });
    expect(router.state.location.pathname).toBe('/bienvenida');
  });

  it('onboarding completado: /bienvenida → /', async () => {
    perfil.actual = perfilCon(true);
    const router = montar('/bienvenida', sesionFalsa());
    await screen.findByRole('heading', { name: 'Hola' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('la navegación marca la página actual con aria-current', async () => {
    perfil.actual = perfilCon(true);
    montar('/estadisticas', sesionFalsa());
    await screen.findByRole('heading', { name: 'Estadísticas' });
    const navs = screen.getAllByRole('navigation', { name: 'Navegación principal' });
    expect(navs).toHaveLength(2); // sidebar + bottom nav (CSS decide cuál se ve)
    for (const nav of navs) {
      expect(within(nav).getByRole('link', { name: 'Estadísticas' })).toHaveAttribute('aria-current', 'page');
    }
    expect(screen.getByRole('link', { name: 'Nuevo movimiento' })).toHaveAttribute('href', '/movimientos/nuevo');
  });

  it('el idioma del perfil se aplica tras el onboarding', async () => {
    perfil.actual = perfilCon(true, 'ca');
    montar('/movimientos', sesionFalsa());
    expect(await screen.findByRole('heading', { name: 'Moviments' })).toBeInTheDocument();
  });

  it('/mas lista Análisis y Configuración', async () => {
    perfil.actual = perfilCon(true);
    montar('/mas', sesionFalsa());
    const main = await screen.findByRole('main');
    expect(within(main).getByRole('link', { name: /Análisis/ })).toHaveAttribute('href', '/analisis');
    expect(within(main).getByRole('link', { name: /Configuración/ })).toHaveAttribute('href', '/configuracion');
  });

  it('rutas de las features: detalle de análisis y de movimiento', async () => {
    perfil.actual = perfilCon(true);
    montar('/analisis/2026-09', sesionFalsa());
    expect(await screen.findByRole('heading', { name: 'Análisis de septiembre de 2026' })).toBeInTheDocument();
  });

  it('ruta desconocida → 404', async () => {
    montar('/no-existe', null);
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });
});
