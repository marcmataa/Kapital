import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import { AyudaGrafico } from './AyudaGrafico';

describe('AyudaGrafico', () => {
  it('icono (i) que abre la ayuda al tocarlo y la cierra con Escape', async () => {
    renderConApp(<AyudaGrafico unidad="dia" />);
    const boton = screen.getByRole('button', { name: 'Cómo leer el gráfico' });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveClass('block');
    await userEvent.keyboard('{Escape}');
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('en táctil (pointer: coarse) no menciona el ratón ni el teclado', () => {
    renderConApp(<AyudaGrafico unidad="mes" />);
    const tactil = screen.getByText('Toca o arrastra por el gráfico para ver cada mes.');
    expect(tactil).toHaveClass('pointer-coarse:inline');
    expect(tactil.textContent).not.toMatch(/ratón|teclado/);
    expect(screen.getByText(/Pasa el ratón/)).toHaveClass('pointer-coarse:hidden');
  });

  it('está traducido', () => {
    renderConApp(<AyudaGrafico unidad="dia" />, { idioma: 'ca' });
    expect(screen.getByRole('button', { name: 'Com llegir el gràfic' })).toBeInTheDocument();
    expect(screen.getByText('Toca o arrossega pel gràfic per veure cada dia.')).toBeInTheDocument();
  });
});
