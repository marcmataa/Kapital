import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import { AyudaGrafico } from './AyudaGrafico';
import { Button } from './Button';
import { EsqueletoPagina, EsqueletoTarjeta } from './Esqueleto';

/* Pulido de la auditoría UX (fase 6): carga y áreas táctiles. */

describe('Carga con esqueletos (F18)', () => {
  it('la página cargando enseña su forma y anuncia «Cargando…» una sola vez', () => {
    renderConApp(<EsqueletoPagina />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(screen.getByTestId('esqueleto-pagina').querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(2);
  });

  it('una tarjeta cargando no es un spinner', () => {
    const { container } = renderConApp(<EsqueletoTarjeta />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});

describe('Áreas táctiles de 44 px con el dedo (F27)', () => {
  it('el (i) de los gráficos y los botones pequeños amplían su zona pulsable', () => {
    renderConApp(
      <>
        <AyudaGrafico unidad="dia" />
        <Button tamano="sm">Añadir</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cómo leer el gráfico' })).toHaveClass('area-tactil', 'size-7');
    expect(screen.getByRole('button', { name: 'Añadir' })).toHaveClass('area-tactil', 'h-8');
  });
});
