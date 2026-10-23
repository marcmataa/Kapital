import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderConApp } from '@/test/render';
import type { ResumenMes } from '../api/estadisticasApi';
import { serieGastoDiario } from '../lib/agregaciones';
import { BalanceMensual } from './BalanceMensual';
import { BarrasCategorias } from './BarrasCategorias';
import { GraficoGastoDiario } from './GraficoGastoDiario';

/*
 * Interacción de los gráficos de Estadísticas (mismo patrón que «Evolución de tu capital»):
 * ratón / dedo (pointer events) y teclado (control deslizante). Datos inventados.
 */

const normal = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** jsdom no maqueta: se le da a la superficie un tamaño para traducir coordenadas a posiciones. */
function conTamano(el: HTMLElement, ancho: number, alto: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: ancho,
    height: alto,
    right: ancho,
    bottom: alto,
    toJSON: () => ({}),
  });
}

describe('GraficoGastoDiario', () => {
  // Octubre (31 días), hoy 19: datos el 3 y el 19.
  const dias = serieGastoDiario(
    [
      { fecha: '2026-10-03', gasto_neto: '40.00' },
      { fecha: '2026-10-19', gasto_neto: '12.35' },
    ],
    '2026-10-01',
    '2026-10-19',
  );
  const pintar = () => renderConApp(<GraficoGastoDiario dias={dias} />);

  it('por defecto lee hoy, provisional', () => {
    pintar();
    expect(normal(screen.getByTestId('lectura-diario').textContent)).toBe('19 oct 2026 · hoy (provisional) · 12,35 €');
    const control = screen.getByRole('slider', { name: 'Día del gráfico de gasto' });
    expect(control).toHaveAttribute('aria-valuenow', '19');
    expect(control).toHaveAttribute('aria-valuemax', '31');
  });

  it('con el teclado recorre los días: fecha e importe del día elegido', async () => {
    pintar();
    const control = screen.getByRole('slider');
    control.focus();
    await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}');
    expect(control).toHaveAttribute('aria-valuenow', '3');
    expect(normal(screen.getByTestId('lectura-diario').textContent)).toBe('3 oct 2026 · 40,00 €');
    expect(normal(control.getAttribute('aria-valuetext'))).toBe('3 oct 2026 · 40,00 €');
    await userEvent.keyboard('{ArrowRight}');
    expect(normal(screen.getByTestId('lectura-diario').textContent)).toBe('4 oct 2026 · 0,00 €');
    await userEvent.keyboard('{End}');
    expect(normal(screen.getByTestId('lectura-diario').textContent)).toBe('31 oct 2026 · aún no ha llegado');
  });

  it('al mover el puntero (ratón o dedo) elige el día bajo él', () => {
    pintar();
    const superficie = screen.getByTestId('superficie-diario');
    conTamano(superficie, 310, 192);
    // 31 columnas de 10 px: x = 25 cae en la tercera (día 3).
    fireEvent.pointerMove(superficie, { clientX: 25, clientY: 100, pointerType: 'mouse' });
    expect(normal(screen.getByTestId('lectura-diario').textContent)).toBe('3 oct 2026 · 40,00 €');
    fireEvent.pointerDown(superficie, { clientX: 305, clientY: 100, pointerType: 'touch' });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '31');
    // Fuera de la superficie se queda en los extremos.
    fireEvent.pointerMove(superficie, { clientX: -40, clientY: 100, pointerType: 'touch' });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '1');
  });

  it('el arrastre horizontal no hace scroll: la superficie solo deja el desplazamiento vertical', () => {
    pintar();
    expect(screen.getByTestId('superficie-diario')).toHaveClass('touch-pan-y');
  });
});

describe('BarrasCategorias', () => {
  const filas = [
    { id: 'super', nombre: 'Supermercado', color: '#5fd3a0', importe: '300.00', porcentaje: '60.0000' },
    { id: 'ocio', nombre: 'Ocio', color: '#9b6bff', importe: '150.00', porcentaje: '30.0000' },
    { id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', importe: '50.00', porcentaje: '10.0000' },
  ];
  const pintar = () => renderConApp(<BarrasCategorias filas={filas} etiqueta="Gasto neto por categoría" />);

  it('lee la primera categoría y recorre con ↓ / ↑', async () => {
    pintar();
    const lectura = () => normal(screen.getByTestId('lectura-barras').textContent);
    expect(lectura()).toBe('Supermercado · 300,00 €60,0 % del total');
    const control = screen.getByRole('slider', { name: 'Categoría · Gasto neto por categoría' });
    control.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(lectura()).toBe('Ocio · 150,00 €30,0 % del total');
    expect(normal(control.getAttribute('aria-valuetext'))).toBe('Ocio · 150,00 € · 30,0 % del total');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(control).toHaveAttribute('aria-valuenow', '1');
  });

  it('al pasar el puntero por una fila la elige', () => {
    pintar();
    const superficie = screen.getByTestId('superficie-barras');
    conTamano(superficie, 300, 150);
    fireEvent.pointerMove(superficie, { clientX: 100, clientY: 130 });
    expect(normal(screen.getByTestId('lectura-barras').textContent)).toBe('Otros gastos · 50,00 €10,0 % del total');
    expect(screen.getByText('Otros gastos').closest('li')).toHaveAttribute('aria-current', 'true');
  });
});

describe('BalanceMensual', () => {
  const fila = (mes: string, balance: string, ahorro: string | null): ResumenMes => ({
    mes,
    ingresos: '1000.00',
    gastos: '0.00',
    devoluciones: '0.00',
    gastos_netos: '0.00',
    balance,
    ahorro_pct: ahorro,
    ajustes: '0.00',
  });
  // Julio solo sirve para comparar agosto: no se dibuja.
  const meses = [
    fila('2026-07-01', '100.00', '10'),
    fila('2026-08-01', '200.00', '20'),
    fila('2026-09-01', '-50.00', null),
  ];
  const pintar = () =>
    renderConApp(
      <BalanceMensual
        meses={meses}
        visibles={['2026-08-01', '2026-09-01']}
        hoy="2026-10-19"
        inicioDatos="2026-07-01"
        anteriorEnCurso={null}
      />,
    );

  it('dibuja solo los meses visibles y lee el último', () => {
    pintar();
    const control = screen.getByRole('slider', { name: 'Mes del gráfico de balance' });
    expect(control).toHaveAttribute('aria-valuemax', '2');
    const texto = normal(screen.getByTestId('lectura-balance').textContent);
    expect(texto).toContain('Septiembre de 2026 · -50,00 €');
    expect(texto).toContain('Ahorro —');
    // 200 → −50: −125,0 %, en rojo (baja el balance).
    expect(texto).toContain('-125,0 %');
    expect(texto).toContain('vs 200,00 € (agosto de 2026)');
    expect(screen.getByText('-125,0 %').parentElement).toHaveClass('text-negativo');
  });

  it('con el teclado o el puntero se elige otro mes, comparado con su anterior aunque no se dibuje', async () => {
    pintar();
    const control = screen.getByRole('slider');
    control.focus();
    await userEvent.keyboard('{ArrowLeft}');
    const texto = normal(screen.getByTestId('lectura-balance').textContent);
    expect(texto).toContain('Agosto de 2026 · +200,00 €');
    expect(texto).toContain('Ahorro 20,0 %');
    expect(texto).toContain('+100,0 %');
    expect(texto).toContain('vs 100,00 € (julio de 2026)');
    const superficie = screen.getByTestId('superficie-balance');
    conTamano(superficie, 200, 208);
    fireEvent.pointerMove(superficie, { clientX: 150, clientY: 50 });
    expect(control).toHaveAttribute('aria-valuenow', '2');
  });
});
