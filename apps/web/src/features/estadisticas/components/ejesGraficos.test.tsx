import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderConApp } from '@/test/render';
import type { ResumenMes } from '../api/estadisticasApi';
import { serieDiaria, type FilaDia } from '../lib/agregaciones';
import { GraficoBalanceMeses } from './GraficoBalanceMeses';
import { GraficoDiario } from './GraficoDiario';
import { GraficoMeses } from './GraficoMeses';
import { FilasComparadas } from './FilasComparadas';

/*
 * Interiores de los gráficos de Estadísticas: ejes redondos, barras negativas bajo el cero,
 * provisionales con relleno (no un borde discontinuo) y ayuda en un icono. Datos inventados.
 */

const normal = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const etiquetasEje = (el: HTMLElement) =>
  [...(el.previousElementSibling?.querySelectorAll('span') ?? [])].map((s) => normal(s.textContent));
/** '33.3333%' → 33.3333 (coordenada de dibujo, no dinero). */
const pct = (v: string) => Number(v.replace('%', ''));

const mes = (m: string, ingresos: string, gastosNetos: string, balance: string): ResumenMes => ({
  mes: m,
  ingresos,
  gastos: gastosNetos,
  devoluciones: '0.00',
  gastos_netos: gastosNetos,
  balance,
  ahorro_pct: null,
  ajustes: '0.00',
});

const FILAS: FilaDia[] = [
  { fecha: '2026-10-02', gastos: '270.00', devoluciones: '0.00', gasto_neto: '270.00', ingresos: '0.00', movimientos: [] },
  // Día con más devoluciones que gastos: gasto neto negativo.
  { fecha: '2026-10-05', gastos: '10.00', devoluciones: '40.00', gasto_neto: '-30.00', ingresos: '0.00', movimientos: [] },
  { fecha: '2026-10-19', gastos: '12.35', devoluciones: '0.00', gasto_neto: '12.35', ingresos: '0.00', movimientos: [] },
];

describe('GraficoDiario · eje y barras', () => {
  const pintar = () =>
    renderConApp(<GraficoDiario dias={serieDiaria(FILAS, '2026-10-01', '2026-10-19')} modo="gastos" nombreMes="Octubre de 2026" />);

  it('eje con números redondos (−30 a 270 € → −200 / 0 / 200 / 400 €)', () => {
    pintar();
    expect(etiquetasEje(screen.getByTestId('superficie-diario').parentElement as HTMLElement)).toEqual([
      '-200 €',
      '0 €',
      '200 €',
      '400 €',
    ]);
  });

  it('un día en negativo dibuja su barra por debajo de la línea del cero', () => {
    pintar();
    const superficie = screen.getByTestId('superficie-diario');
    const cero = superficie.querySelector<HTMLElement>('[data-cero="true"]');
    expect(cero).not.toBeNull();
    const posCero = pct(cero?.style.bottom ?? '');
    const barra = (dia: number) => superficie.querySelector<HTMLElement>(`[data-dia="${dia}"] span > span`);
    expect(barra(5)).toHaveClass('bg-negativo');
    expect(pct(barra(5)?.style.bottom ?? '') + pct(barra(5)?.style.height ?? '')).toBeCloseTo(posCero, 3);
    expect(pct(barra(5)?.style.height ?? '')).toBeGreaterThan(0);
    expect(pct(barra(2)?.style.bottom ?? '')).toBeCloseTo(posCero, 3);
  });

  it('hoy es provisional con relleno rayado, nunca un borde discontinuo', () => {
    pintar();
    const hoy = screen.getByTestId('superficie-diario').querySelector('[data-provisional="true"]');
    expect(hoy).toHaveClass('relleno-provisional');
    expect(hoy).not.toHaveClass('border-dashed');
  });

  it('la ayuda de uso es un icono (i), no un párrafo repetido', () => {
    pintar();
    expect(screen.getByRole('button', { name: 'Cómo leer el gráfico' })).toBeInTheDocument();
    expect(screen.queryByText(/Pasa el ratón o el dedo/)).not.toBeInTheDocument();
  });
});

describe('GraficoMeses · pocos meses', () => {
  it('las barras tienen ancho máximo y el mes en curso es provisional con relleno', () => {
    renderConApp(<GraficoMeses hoy="2026-10-19" meses={[mes('2026-09-01', '0.00', '1168.28', '0.00'), mes('2026-10-01', '0.00', '80.00', '0.00')]} />);
    const superficie = screen.getByTestId('superficie-meses');
    expect(superficie.querySelectorAll('.max-w-14')).toHaveLength(2);
    expect(superficie.querySelector('[data-provisional="true"]')).toHaveClass('relleno-provisional', 'text-acento');
    expect(etiquetasEje(superficie.parentElement as HTMLElement)).toEqual(['0 €', '500 €', '1.000 €', '1.500 €']);
  });
});

describe('GraficoBalanceMeses · balance en su franja', () => {
  const meses = [
    mes('2026-08-01', '1420.00', '1190.40', '229.60'),
    mes('2026-09-01', '1508.00', '1168.28', '339.72'),
    mes('2026-10-01', '0.00', '50.00', '-50.00'),
  ];

  it('el balance tiene su propio eje con el cero, y el mes en curso muestra su valor', () => {
    renderConApp(<GraficoBalanceMeses hoy="2026-10-19" meses={meses} />);
    const franja = screen.getByTestId('franja-balance');
    expect(etiquetasEje(franja)).toContain('0 €');
    expect(etiquetasEje(franja).length).toBeLessThanOrEqual(3);
    expect(normal(within(franja).getByTestId('valor-mes-en-curso').textContent)).toBe('-50,00 €');
    const barras = screen.getByTestId('superficie-balance').querySelectorAll('[data-provisional="true"]');
    expect(barras).toHaveLength(2);
    barras.forEach((b) => expect(b).toHaveClass('relleno-provisional'));
  });
});

describe('FilasComparadas · leyenda de las barras dobles', () => {
  it('dice cuál es este mes y cuál el anterior; sin anterior no hay leyenda', () => {
    const fila = { id: 'o', nombre: 'Ocio con un nombre muy largo de verdad', color: '#9b6bff', actual: '30.00', anterior: '20.00' };
    const { unmount } = renderConApp(<FilasComparadas filas={[fila]} etiqueta="Categorías" etiquetaAnterior="antes" />);
    expect(screen.getByTestId('leyenda-comparada')).toHaveTextContent('Este mesMes anterior');
    expect(screen.getByText(fila.nombre)).toHaveAttribute('title', fila.nombre);
    unmount();
    renderConApp(<FilasComparadas filas={[{ ...fila, anterior: null }]} etiqueta="Categorías" etiquetaAnterior="antes" />);
    expect(screen.queryByTestId('leyenda-comparada')).not.toBeInTheDocument();
  });
});
