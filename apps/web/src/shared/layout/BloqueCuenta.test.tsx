import { Route, Routes } from 'react-router';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import { Sidebar } from './Sidebar';

vi.mock('@/shared/lib/supabase', () => ({ supabase: { auth: {} } }));

function pintar(sesion = sesionFalsa(), cerrarSesion = vi.fn(() => Promise.resolve())) {
  renderConApp(
    <Routes>
      <Route path="/login" element={<h1>Pantalla de login</h1>} />
      <Route path="*" element={<Sidebar />} />
    </Routes>,
    { sesion, auth: { cerrarSesion }, ruta: '/movimientos' },
  );
  return cerrarSesion;
}

describe('Sidebar · bloque de cuenta', () => {
  it('muestra nombre y email completos en title (por si se truncan)', () => {
    pintar(
      sesionFalsa(undefined, {
        email: 'lucia.prueba@ejemplo.com',
        user_metadata: { given_name: 'Lucía', full_name: 'Lucía Prueba Gómez' },
      }),
    );
    const cuenta = screen.getByRole('region', { name: 'Tu cuenta' });
    expect(within(cuenta).getByText('Lucía Prueba Gómez')).toHaveAttribute('title', 'Lucía Prueba Gómez');
    expect(within(cuenta).getByText('lucia.prueba@ejemplo.com')).toHaveAttribute('title', 'lucia.prueba@ejemplo.com');
    expect(within(cuenta).getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument();
  });

  it('sin nombre (email y contraseña) muestra solo el email', () => {
    pintar(sesionFalsa(undefined, { email: 'pau@ejemplo.com' }));
    const cuenta = screen.getByRole('region', { name: 'Tu cuenta' });
    expect(cuenta.querySelectorAll('p')).toHaveLength(1);
    expect(within(cuenta).getByText('pau@ejemplo.com')).toBeInTheDocument();
  });

  it('«Cerrar sesión» cierra la sesión y deja la app en /login', async () => {
    const cerrarSesion = pintar(sesionFalsa(undefined, { email: 'pau@ejemplo.com' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(cerrarSesion).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Pantalla de login' })).toBeInTheDocument();
  });

  it('está traducido', () => {
    renderConApp(<Sidebar />, { sesion: sesionFalsa(), idioma: 'ca' });
    const cuenta = screen.getByRole('region', { name: 'El teu compte' });
    expect(within(cuenta).getByRole('button', { name: 'Tancar la sessió' })).toBeInTheDocument();
  });
});
