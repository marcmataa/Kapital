import { Route, Routes } from 'react-router';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import { PaginaMas } from './PaginaMas';
import { Sidebar } from './Sidebar';
import { cambiarTema } from './useTema';

vi.mock('@/shared/lib/supabase', () => ({ supabase: { auth: {} } }));

afterEach(() => cambiarTema('oscuro'));

function pintar(cerrarSesion = vi.fn(() => Promise.resolve())) {
  renderConApp(
    <Routes>
      <Route path="/login" element={<h1>Pantalla de login</h1>} />
      <Route path="*" element={<PaginaMas />} />
    </Routes>,
    { sesion: sesionFalsa(undefined, { email: 'pau@ejemplo.com' }), auth: { cerrarSesion }, ruta: '/mas' },
  );
  return cerrarSesion;
}

describe('Más (móvil)', () => {
  it('tiene Análisis, Configuración, Apariencia, Cuenta y, al final, Cerrar sesión', () => {
    pintar();
    expect(screen.getByRole('link', { name: /Análisis/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Configuración/ })).toBeInTheDocument();
    const apariencia = screen.getByRole('region', { name: 'Apariencia' });
    expect(within(apariencia).getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument();
    expect(within(apariencia).getByRole('radio', { name: 'Automático' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cuenta' })).toHaveTextContent('pau@ejemplo.com');
    const botones = screen.getAllByRole('button');
    expect(botones[botones.length - 1]).toHaveAccessibleName('Cerrar sesión');
  });

  it('el tema es el mismo estado que el del menú lateral', async () => {
    renderConApp(
      <>
        <PaginaMas />
        <Sidebar />
      </>,
      { sesion: sesionFalsa() },
    );
    const [mas, lateral] = screen.getAllByRole('radiogroup', { name: 'Tema' });
    if (!mas || !lateral) throw new Error('faltan selectores de tema');
    await userEvent.click(within(mas).getByRole('radio', { name: 'Claro' }));
    expect(within(lateral).getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('«Cerrar sesión» cierra la sesión', async () => {
    const cerrarSesion = pintar();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(cerrarSesion).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Pantalla de login' })).toBeInTheDocument();
  });
});
