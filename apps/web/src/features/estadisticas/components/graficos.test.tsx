import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderConApp } from '@/test/render';
import type { Comparativa, ResumenMes } from '../api/estadisticasApi';
import { serieDiaria, type FilaDia } from '../lib/agregaciones';
import { BarrasCategorias } from './BarrasCategorias';
import { DesgloseBalance } from './DesgloseBalance';
import { GraficoBalanceMeses } from './GraficoBalanceMeses';
import { GraficoDiario } from './GraficoDiario';
import { GraficoMeses } from './GraficoMeses';

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

// Octubre (31 días), hoy 19.
const FILAS: FilaDia[] = [
  {
    fecha: '2026-10-03',
    gastos: '50.00',
    devoluciones: '10.00',
    gasto_neto: '40.00',
    ingresos: '0.00',
    movimientos: [
      { id: 'm1', tipo: 'gasto', concepto: 'Cena', importe: '50.00' },
      { id: 'm2', tipo: 'devolucion', concepto: 'Ana - cena', importe: '10.00' },
    ],
  },
  {
    fecha: '2026-10-19',
    gastos: '12.35',
    devoluciones: '0.00',
    gasto_neto: '12.35',
    ingresos: '900.00',
    movimientos: [
      { id: 'm3', tipo: 'gasto', concepto: 'Pan', importe: '12.35' },
      { id: 'm4', tipo: 'ingreso', concepto: 'Nómina', importe: '900.00' },
    ],
  },
];
const DIAS = serieDiaria(FILAS, '2026-10-01', '2026-10-19');

describe('GraficoDiario · gastos', () => {
  const pintar = () => renderConApp(<GraficoDiario dias={DIAS} modo="gastos" nombreMes="Octubre de 2026" />);
  const lectura = () => normal(screen.getByTestId('lectura-diario').textContent);

  it('por defecto lee hoy, provisional, con sus gastos (sin ingresos)', () => {
    pintar();
    expect(screen.getByRole('heading', { name: 'Gasto por día · Octubre de 2026' })).toBeInTheDocument();
    expect(lectura()).toContain('19 oct 2026 · hoy (provisional) · 12,35 €');
    expect(lectura()).toContain('Gastos 12,35 € · Neto 12,35 €');
    // El día y su dinero; qué se compró está en Movimientos.
    expect(within(screen.getByTestId('lectura-diario')).queryByRole('list')).not.toBeInTheDocument();
    expect(lectura()).not.toContain('Pan');
    const control = screen.getByRole('slider', { name: 'Día del gráfico' });
    expect(control).toHaveAttribute('aria-valuenow', '19');
    expect(control).toHaveAttribute('aria-valuemax', '31');
  });

  it('con el teclado: día, gastos, devoluciones y neto (sin la lista de compras)', async () => {
    pintar();
    const control = screen.getByRole('slider');
    control.focus();
    await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}');
    expect(control).toHaveAttribute('aria-valuenow', '3');
    expect(lectura()).toContain('3 oct 2026 · 40,00 €');
    // «Gastos X · Devoluciones −Y · Neto Z»: la devolución resta (decisión del usuario, §6).
    expect(lectura()).toContain('Gastos 50,00 € · Devoluciones -10,00 € · Neto 40,00 €');
    expect(lectura()).not.toContain('Cena');
    expect(normal(control.getAttribute('aria-valuetext'))).toContain('Devoluciones -10,00 €');
    expect(normal(control.getAttribute('aria-valuetext'))).not.toContain('Ana - cena');
    await userEvent.keyboard('{ArrowRight}');
    expect(lectura()).toBe('4 oct 2026 · 0,00 €Gastos 0,00 € · Neto 0,00 €');
    await userEvent.keyboard('{End}');
    expect(lectura()).toBe('31 oct 2026 · aún no ha llegado');
  });

  it('al mover el puntero (ratón o dedo) elige el día bajo él; la superficie solo deja el scroll vertical', () => {
    pintar();
    const superficie = screen.getByTestId('superficie-diario');
    expect(superficie).toHaveClass('touch-pan-y');
    conTamano(superficie, 310, 192);
    // 31 columnas de 10 px: x = 25 cae en la tercera (día 3).
    fireEvent.pointerMove(superficie, { clientX: 25, clientY: 100, pointerType: 'mouse' });
    expect(lectura()).toContain('3 oct 2026 · 40,00 €');
    fireEvent.pointerDown(superficie, { clientX: 305, clientY: 100, pointerType: 'touch' });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '31');
    fireEvent.pointerMove(superficie, { clientX: -40, clientY: 100, pointerType: 'touch' });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '1');
  });
});

describe('GraficoDiario · ingresos', () => {
  it('solo ingresos reales: ni barra, ni leyenda, ni lectura, ni nota de devoluciones', async () => {
    renderConApp(<GraficoDiario dias={DIAS} modo="ingresos" nombreMes="Octubre de 2026" />);
    expect(screen.getByRole('heading', { name: 'Ingresos por día · Octubre de 2026' })).toBeInTheDocument();
    expect(screen.queryByText(/[Dd]evoluci/)).not.toBeInTheDocument();
    const lectura = () => normal(screen.getByTestId('lectura-diario').textContent);
    expect(lectura()).toContain('19 oct 2026 · hoy (provisional) · 900,00 €');
    expect(lectura()).not.toContain('Nómina');
    // Una sola barra por día (la del ingreso).
    const superficie = screen.getByTestId('superficie-diario');
    for (const dia of Array.from(superficie.children)) expect(dia.querySelectorAll('div').length).toBeLessThanOrEqual(1);
    const control = screen.getByRole('slider');
    control.focus();
    await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}');
    // Día 3: sin ingresos; su devolución no sale en esta vista.
    expect(lectura()).toBe('3 oct 2026 · 0,00 €');
    expect(normal(control.getAttribute('aria-valuetext'))).not.toMatch(/Devoluci|Ana/);
  });
});

describe('BarrasCategorias', () => {
  const filas = [
    { id: 'super', nombre: 'Supermercado', color: '#5fd3a0', importe: '300.00', porcentaje: '60.0000' },
    { id: 'ocio', nombre: 'Ocio', color: '#9b6bff', importe: '150.00', porcentaje: '30.0000' },
    { id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', importe: '50.00', porcentaje: '10.0000' },
  ];
  const pintar = () => renderConApp(<BarrasCategorias filas={filas} etiqueta="Ingresos por categoría" />);

  it('lee la primera categoría y recorre con ↓ / ↑', async () => {
    pintar();
    const lectura = () => normal(screen.getByTestId('lectura-barras').textContent);
    expect(lectura()).toBe('Supermercado · 300,00 €60,0 % del total');
    const control = screen.getByRole('slider', { name: 'Categoría · Ingresos por categoría' });
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
  });
});

const mesResumen = (mes: string, ingresos: string, gastosNetos: string, balance: string, ahorro: string | null): ResumenMes => ({
  mes,
  ingresos,
  gastos: gastosNetos,
  devoluciones: '0.00',
  gastos_netos: gastosNetos,
  balance,
  ahorro_pct: ahorro,
  ajustes: '0.00',
});

describe('GraficoMeses (gasto de los últimos meses)', () => {
  it('lee el último mes y recorre con el teclado y el puntero', async () => {
    renderConApp(
      <GraficoMeses
        hoy="2026-10-19"
        meses={[mesResumen('2026-09-01', '1508.00', '1168.28', '339.72', '22.5'), mesResumen('2026-10-01', '0.00', '80.00', '-80.00', null)]}
      />,
    );
    const lectura = () => normal(screen.getByTestId('lectura-meses').textContent);
    expect(lectura()).toBe('Octubre de 2026 · hasta hoy (provisional) · 80,00 €');
    const control = screen.getByRole('slider', { name: 'Mes del gráfico de gasto' });
    control.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(lectura()).toBe('Septiembre de 2026 · 1.168,28 €');
    const superficie = screen.getByTestId('superficie-meses');
    conTamano(superficie, 200, 176);
    fireEvent.pointerMove(superficie, { clientX: 150, clientY: 50 });
    expect(control).toHaveAttribute('aria-valuenow', '2');
  });
});

describe('GraficoBalanceMeses', () => {
  const meses = [
    mesResumen('2026-08-01', '1420.00', '1190.40', '229.60', '16.1690140845070423'),
    mesResumen('2026-09-01', '1508.00', '1168.28', '339.72', '22.5278514588859416'),
    mesResumen('2026-10-01', '0.00', '50.00', '-50.00', null),
  ];

  it('lectura con ingresos, gastos netos, balance y ahorro; «—» sin ingresos', async () => {
    renderConApp(<GraficoBalanceMeses hoy="2026-10-19" meses={meses} />);
    const lectura = () => normal(screen.getByTestId('lectura-balance').textContent);
    expect(lectura()).toContain('Octubre de 2026 · hasta hoy (provisional) · balance · -50,00 €');
    expect(lectura()).toContain('Ingresos 0,00 € · Gastos netos 50,00 € · Ahorro —');
    const control = screen.getByRole('slider', { name: 'Mes del gráfico de balance' });
    control.focus();
    await userEvent.keyboard('{ArrowLeft}');
    // Sección 11: 1.508,00 − 1.168,28 = 339,72 € y ahorro 22,5 %.
    expect(lectura()).toContain('Septiembre de 2026 · balance · +339,72 €');
    expect(lectura()).toContain('Ingresos 1.508,00 € · Gastos netos 1.168,28 € · Ahorro 22,5 %');
    expect(screen.getByTestId('superficie-balance').querySelectorAll('[data-balance]')).toHaveLength(3);
    const superficie = screen.getByTestId('superficie-balance');
    expect(superficie).toHaveClass('touch-pan-y');
    conTamano(superficie, 300, 208);
    fireEvent.pointerMove(superficie, { clientX: 10, clientY: 50 });
    expect(lectura()).toContain('Agosto de 2026');
  });
});

describe('DesgloseBalance', () => {
  const comparativa: Comparativa = {
    gastos_netos: '1168.28',
    gastos_netos_anterior: '1190.40',
    variacion_gastos: '-1.8582',
    ingresos: '1508.00',
    ingresos_anterior: '1420.00',
    variacion_ingresos: '6.1972',
    balance: '339.72',
    balance_anterior: '229.60',
    variacion_balance: '47.9617',
    dias: 30,
    gasto_medio_diario: '38.9426666666666667',
    mayor_concepto: 'Alquiler',
    mayor_importe: '700.00',
  };
  const pintar = (enCurso: boolean) =>
    renderConApp(
      <DesgloseBalance
        periodos={
          enCurso
            ? { actual: { desde: '2026-10-01', hasta: '2026-10-23' }, anterior: { desde: '2026-09-01', hasta: '2026-09-23' }, enCurso }
            : { actual: { desde: '2026-09-01', hasta: '2026-09-30' }, anterior: { desde: '2026-08-01', hasta: '2026-08-31' }, enCurso }
        }
        comparativa={comparativa}
        ingresos={[{ categoria_id: 'n', nombre: 'Nómina', color: '#5fd3a0', ingreso: '1508.00' }]}
        ingresosAnterior={[{ categoria_id: 'n', nombre: 'Nómina', color: '#5fd3a0', ingreso: '1420.00' }]}
        gastos={[{ categoria_id: 'o', nombre: 'Ocio', color: '#9b6bff', gasto: '1168.28' }]}
        gastosAnterior={[{ categoria_id: 'o', nombre: 'Ocio', color: '#9b6bff', gasto: '1190.40' }]}
        fuera={[
          { tipo: 'traspaso', cuenta: 'BBVA', cuenta_destino: 'Trade Republic', sentido: null, importe: '100.00' },
          { tipo: 'ajuste', cuenta: 'BBVA', cuenta_destino: null, sentido: 'resta', importe: '5.00' },
        ]}
        fueraAnterior={[]}
      />,
    );

  it('mes cerrado: «vs agosto completo», balance con % y lo que no cuenta, aparte', () => {
    pintar(false);
    expect(screen.getByText('Este mes vs agosto completo')).toBeInTheDocument();
    const cuenta = screen.getByRole('list', { name: 'Cuenta en el balance' });
    expect(within(cuenta).getByText('Ingresos').closest('li')).toHaveTextContent('1.508,00 €');
    expect(within(cuenta).getByText('Gastos netos').closest('li')).toHaveTextContent('1.168,28 €');
    const balance = screen.getByTestId('fila-balance');
    expect(within(balance).getByText('+339,72 €')).toHaveClass('text-positivo');
    expect(within(balance).getByText('+48,0 %').parentElement).toHaveClass('text-positivo');
    // «+339,72 € vs +229,60 € el mes pasado», con el % aparte (nada de «+48,0 % antes»).
    expect(normal(within(balance).getByTestId('balance-vs').textContent)).toBe('+339,72 € vs +229,60 € el mes pasado');
    expect(normal(balance.textContent)).not.toContain('antes');
    // Grupo B: traspasos y ajustes, fuera de cualquier total.
    const fuera = screen.getByTestId('fuera-del-balance');
    expect(within(fuera).getByText('Traspaso BBVA → Trade Republic').closest('li')).toHaveTextContent('100,00 €');
    expect(within(fuera).getByText('Ajuste BBVA (resta)').closest('li')).toHaveTextContent('-5,00 €');
    expect(within(cuenta).queryByText(/Traspaso|Ajuste/)).not.toBeInTheDocument();
  });

  it('mes en curso: «vs mes anterior al día 23»', () => {
    pintar(true);
    expect(screen.getByText('Este mes vs mes anterior al día 23')).toBeInTheDocument();
  });
});
