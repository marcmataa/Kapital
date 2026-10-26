import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import { AuthLayout } from './AuthLayout';

describe('AuthLayout (login y registro)', () => {
  it('cambia el idioma desde la propia pantalla y lo recuerda', async () => {
    renderConApp(
      <AuthLayout titulo="Título">
        <p>formulario</p>
      </AuthLayout>,
    );
    expect(screen.getByRole('complementary', { name: 'Qué es Kapital' })).toHaveTextContent('Sabes cuánto ahorras');
    await userEvent.click(screen.getByRole('radio', { name: 'Català' }));
    expect(screen.getByRole('radio', { name: 'Català' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('complementary', { name: 'Què és Kapital' })).toHaveTextContent('Saps quant estalvies');
    expect(window.localStorage.getItem('kapital.idioma')).toBe('ca');
  });

  it('tiene el mismo selector de tema que el resto de la app', () => {
    renderConApp(
      <AuthLayout titulo="Título">
        <p>formulario</p>
      </AuthLayout>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument();
  });
});
