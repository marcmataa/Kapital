import { Route, Routes, useLocation } from 'react-router';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import { useAtajosTeclado } from './useAtajosTeclado';

function Ruta() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

function Pagina() {
  useAtajosTeclado();
  return (
    <main id="contenido">
      <Ruta />
      <input aria-label="Nombre" />
      <Routes>
        <Route path="/movimientos" element={<input type="search" aria-label="Buscar" />} />
        <Route path="*" element={null} />
      </Routes>
    </main>
  );
}

const ruta = () => screen.getByTestId('ruta').textContent;

describe('atajos de teclado', () => {
  it('N abre «Nuevo movimiento»', async () => {
    renderConApp(<Pagina />, { ruta: '/' });
    await userEvent.keyboard('n');
    expect(ruta()).toBe('/movimientos/nuevo');
  });

  it('/ lleva a Movimientos y pone el foco en la búsqueda', async () => {
    renderConApp(<Pagina />, { ruta: '/estadisticas' });
    await userEvent.keyboard('/');
    expect(ruta()).toBe('/movimientos');
    await act(() => new Promise((r) => setTimeout(r, 80)));
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveFocus();
  });

  it('/ en Movimientos enfoca la búsqueda sin escribir la barra', async () => {
    renderConApp(<Pagina />, { ruta: '/movimientos' });
    await userEvent.keyboard('/');
    const buscar = screen.getByRole('searchbox', { name: 'Buscar' });
    expect(buscar).toHaveFocus();
    expect(buscar).toHaveValue('');
  });

  it('no actúan mientras se escribe en un campo', async () => {
    renderConApp(<Pagina />, { ruta: '/' });
    const campo = screen.getByRole('textbox', { name: 'Nombre' });
    await userEvent.click(campo);
    await userEvent.keyboard('n/');
    expect(ruta()).toBe('/');
    expect(campo).toHaveValue('n/');
  });

  it('no actúan con un diálogo abierto', () => {
    renderConApp(
      <>
        <Pagina />
        <div role="dialog" aria-label="Hoja" />
      </>,
      { ruta: '/' },
    );
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(ruta()).toBe('/');
  });

  it('con modificadores no hace nada', () => {
    renderConApp(<Pagina />, { ruta: '/' });
    fireEvent.keyDown(document.body, { key: 'n', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'n', metaKey: true });
    expect(ruta()).toBe('/');
  });
});
