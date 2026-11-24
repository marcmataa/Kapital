import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderConApp } from '@/test/render';
import type { Comparativa, ResumenMes } from '../api/estadisticasApi';
import { periodosComparacion } from '@/shared/lib/periodos';
import { serieDiaria, type FilaDia } from '../lib/agregaciones';
import { ComparativaMes } from './ComparativaMes';
import { IngresosPorCategoria } from './IngresosPorCategoria';
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

  it('la lectura solo aparece al usar el gráfico; entonces lee hoy, provisional, con sus gastos (sin ingresos)', () => {
    pintar();
    expect(screen.getByRole('heading', { name: 'Gasto por día · Octubre de 2026' })).toBeInTheDocument();
    expect(screen.queryByTestId('lectura-diario')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Shift' });
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
    // Con el dedo la lectura se queda; con el ratón se va al salir.
    fireEvent.pointerLeave(superficie, { pointerType: 'touch' });
    expect(screen.getByTestId('lectura-diario')).toBeInTheDocument();
    fireEvent.pointerLeave(superficie, { pointerType: 'mouse' });
    expect(screen.queryByTestId('lectura-diario')).not.toBeInTheDocument();
  });

  it('línea de referencia con la media diaria (de SQL); sin media no se dibuja', () => {
    const { unmount } = renderConApp(<GraficoDiario dias={DIAS} modo="gastos" nombreMes="Octubre de 2026" media="40.59" />);
    expect(normal(screen.getByTestId('media-diaria').textContent)).toBe('media 40,59 €/día');
    unmount();
    pintar();
    expect(screen.queryByTestId('media-diaria')).not.toBeInTheDocument();
  });
});

describe('GraficoDiario · ingresos', () => {
  it('solo ingresos reales: ni barra, ni leyenda, ni lectura, ni nota de devoluciones', async () => {
    renderConApp(<GraficoDiario dias={DIAS} modo="ingresos" nombreMes="Octubre de 2026" />);
    expect(screen.getByRole('heading', { name: 'Ingresos por día · Octubre de 2026' })).toBeInTheDocument();
    // Fuera de la definición del (i) («las devoluciones no son ingresos»), nada de devoluciones.
    expect(within(screen.getByRole('slider')).queryByText(/[Dd]evoluci/)).not.toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ingresos del periodo. Las devoluciones no son ingresos');
    const lectura = () => normal(screen.getByTestId('lectura-diario').textContent);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Shift' });
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

describe('IngresosPorCategoria · lectura y barras dobles', () => {
  const filas = [
    { id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', importe: '300.00', porcentaje: '60.0000' },
    { id: 'rend', nombre: 'Rendimientos', color: '#9b6bff', importe: '150.00', porcentaje: '30.0000' },
    { id: 'otros', nombre: 'Otros ingresos', color: '#8f9bbd', importe: '50.00', porcentaje: '10.0000' },
  ];
  const anteriores = [{ categoria_id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', ingreso: '280.00' }];
  const periodos = periodosComparacion('2026-11-01', '2026-11-24', '2026-01-01');
  const pintar = () => renderConApp(<IngresosPorCategoria ingresos={filas} anteriores={anteriores} periodos={periodos} />);

  it('título «Ingresos por categoría: Nov vs Oct», leyenda de meses y sin % en las filas', () => {
    pintar();
    expect(screen.getByText('Ingresos por categoría: Nov vs Oct')).toBeInTheDocument();
    expect(screen.getByTestId('leyenda-meses')).toHaveTextContent('Este mes · noviembreMes anterior · octubre');
    const lista = screen.getByTestId('superficie-barras');
    expect(normal(lista.textContent)).not.toMatch(/%/);
    // Nómina: 300,00 € este mes y 280,00 € el anterior; las otras no estaban: 0,00 €.
    expect(within(lista).getAllByTestId('importe-actual').map((e) => normal(e.textContent))).toEqual(['300,00 €', '150,00 €', '50,00 €']);
    expect(within(lista).getAllByTestId('importe-anterior').map((e) => normal(e.textContent))).toEqual([
      'mes anterior 280,00 €',
      'mes anterior 0,00 €',
      'mes anterior 0,00 €',
    ]);
  });

  it('lee la primera categoría y recorre con ↓ / ↑', async () => {
    pintar();
    const lectura = () => normal(screen.getByTestId('lectura-barras').textContent);
    expect(lectura()).toBe('Nómina · 300,00 €60,0 % del total');
    const control = screen.getByRole('slider', { name: 'Categoría · Ingresos por categoría: Nov vs Oct' });
    control.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(lectura()).toBe('Rendimientos · 150,00 €30,0 % del total');
    expect(normal(control.getAttribute('aria-valuetext'))).toBe('Rendimientos · 150,00 € · 30,0 % del total');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(control).toHaveAttribute('aria-valuenow', '1');
  });

  it('al pasar el puntero por una fila la elige', () => {
    pintar();
    const superficie = screen.getByTestId('superficie-barras');
    conTamano(superficie, 300, 150);
    fireEvent.pointerMove(superficie, { clientX: 100, clientY: 130 });
    expect(normal(screen.getByTestId('lectura-barras').textContent)).toBe('Otros ingresos · 50,00 €10,0 % del total');
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
    expect(lectura()).toContain('Ingresos 0,00 € · Gastos netos 50,00 € · Tasa de ahorro —');
    const control = screen.getByRole('slider', { name: 'Mes del gráfico de balance' });
    control.focus();
    await userEvent.keyboard('{ArrowLeft}');
    // Sección 11: 1.508,00 − 1.168,28 = 339,72 € y ahorro 22,5 %.
    expect(lectura()).toContain('Septiembre de 2026 · balance · +339,72 €');
    expect(lectura()).toContain('Ingresos 1.508,00 € · Gastos netos 1.168,28 € · Tasa de ahorro 22,5 %');
    expect(screen.getByTestId('superficie-balance').querySelectorAll('[data-balance]')).toHaveLength(3);
    const superficie = screen.getByTestId('superficie-balance');
    expect(superficie).toHaveClass('touch-pan-y');
    conTamano(superficie, 300, 208);
    fireEvent.pointerMove(superficie, { clientX: 10, clientY: 50 });
    expect(lectura()).toContain('Agosto de 2026');
  });

  it('ahorro fuera de ±100 %: un texto en lugar del porcentaje (cambio del 02/11/2026)', () => {
    renderConApp(<GraficoBalanceMeses hoy="2026-10-19" meses={[mesResumen('2026-10-01', '100.00', '350.00', '-250.00', '-250.0000')]} />);
    const lectura = normal(screen.getByTestId('lectura-balance').textContent);
    expect(lectura).toContain('Tasa de ahorro: no se calcula (ingresos insuficientes)');
    expect(lectura).not.toContain('-250,0 %');
  });

  it('título por contenido y, en el mes en curso, la marca del mes anterior al mismo día', () => {
    renderConApp(
      <GraficoBalanceMeses hoy="2026-10-19" meses={meses} referencia={{ mes: '2026-09-01', dia: 19, importe: '120.00' }} />,
    );
    expect(screen.getByRole('heading', { name: 'Balance mensual · desde agosto' })).toBeInTheDocument();
    const marca = screen.getByTestId('marca-referencia');
    expect(marca).toHaveAttribute('data-balance', '120.00');
    // La comparación ya está en la cabecera: la lectura solo lleva la marca, sin repetir el importe.
    expect(normal(screen.getByTestId('lectura-balance').textContent)).not.toContain('al día 19');
    expect(screen.getByText('Rayado: mes en curso, provisional')).toBeInTheDocument();
  });

  it('sin el mes en curso en el gráfico no hay marca ni leyenda de provisional', () => {
    renderConApp(
      <GraficoBalanceMeses hoy="2026-11-05" meses={meses} referencia={{ mes: '2026-10-01', dia: 5, importe: '10.00' }} />,
    );
    expect(screen.queryByTestId('marca-referencia')).not.toBeInTheDocument();
    expect(screen.queryByText(/Rayado/)).not.toBeInTheDocument();
  });
});

describe('GraficoDiario · las barras tienen ancho (auditoría F01)', () => {
  it('ninguna columna usa padding en % (se calcula sobre el padre); cada barra mide un 76 % y al menos 2 px', () => {
    renderConApp(<GraficoDiario dias={serieDiaria(FILAS, '2026-10-01', '2026-10-19')} modo="gastos" nombreMes="Octubre de 2026" />);
    const superficie = screen.getByTestId('superficie-diario');
    const columnas = Array.from(superficie.querySelectorAll('[data-dia]'));
    expect(columnas).toHaveLength(31);
    for (const c of columnas) expect(c.className).not.toMatch(/p[xl]?-\[\d+%\]/);
    const barras = screen.getAllByTestId('columna-barra');
    // 19 días hasta hoy (los futuros no tienen barra).
    expect(barras).toHaveLength(19);
    for (const b of barras) expect(b).toHaveClass('w-[76%]', 'min-w-[2px]');
  });
});

describe('ComparativaMes · gasto medio diario (auditoría F14)', () => {
  const datos: Comparativa = {
    gastos_netos: '310.00',
    gastos_netos_anterior: '300.00',
    variacion_gastos: '3.3333',
    ingresos: '0.00',
    ingresos_anterior: '0.00',
    variacion_ingresos: null,
    balance: '-310.00',
    balance_anterior: '-300.00',
    variacion_balance: '-3.3333',
    dias: 31,
    gasto_medio_diario: '10.00',
    mayor_concepto: null,
    mayor_importe: null,
  };
  const ritmo = {
    devoluciones: '0.00',
    gasto_medio_diario: '10.00',
    gasto_medio_diario_anterior: '10.00',
    variacion_medio_diario: '0.0000',
    dias_mes: 31,
    proyeccion_fin_mes: null,
  };
  const pintar = (hastaAnterior: string) =>
    renderConApp(
      <ComparativaMes
        periodos={{ actual: { desde: '2026-10-01', hasta: '2026-10-31' }, anterior: { desde: '2026-09-01', hasta: hastaAnterior }, enCurso: false }}
        datos={datos}
        modo="gastos"
        ritmo={ritmo}
      />,
    );
  const tarjetaMedio = () => screen.getByRole('heading', { name: 'Gasto medio diario' }).closest('article') as HTMLElement;

  it('distinta longitud (31 contra 30 días): el % del gasto medio diario sí aporta y se muestra', () => {
    pintar('2026-09-30');
    expect(within(tarjetaMedio()).getByTestId('linea-variacion')).toHaveTextContent('frente a 10,00 €/día');
  });

  it('misma longitud (19 contra 19): el gasto diario no se compara, repetiría lo que dice Gastos', () => {
    renderConApp(
      <ComparativaMes
        periodos={{ actual: { desde: '2026-10-01', hasta: '2026-10-19' }, anterior: { desde: '2026-09-01', hasta: '2026-09-19' }, enCurso: true }}
        datos={{ ...datos, dias: 19 }}
        modo="gastos"
        ritmo={ritmo}
      />,
    );
    expect(within(tarjetaMedio()).queryByTestId('linea-variacion')).not.toBeInTheDocument();
    expect(within(tarjetaMedio()).queryByText(/frente a|mes pasado/)).not.toBeInTheDocument();
  });
});
