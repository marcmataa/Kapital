import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import PaginaEstadisticas from './pages/PaginaEstadisticas';
import { columnas, estado, PERFIL, reiniciar, type Llamada, type Respuesta } from '@/test/supabaseFalso';

vi.mock('@/shared/lib/supabase', async () => (await import('@/test/supabaseFalso')).moduloFalso);

const CEROS = {
  ingresos: '0.00',
  gastos: '0.00',
  devoluciones: '0.00',
  gastos_netos: '0.00',
  balance: '0.00',
  ahorro_pct: null,
  ajustes: '0.00',
};

// Sección 11: septiembre 2026, ingresos 1.508,00 − gastos netos 1.168,28 = 339,72 (22,5 %).
const SEPTIEMBRE = {
  ingresos: '1508.00',
  gastos: '1228.28',
  devoluciones: '60.00',
  gastos_netos: '1168.28',
  balance: '339.72',
  ahorro_pct: '22.5278514588859416',
  ajustes: '0.00',
};
const AGOSTO = { ...CEROS, ingresos: '1420.00', gastos: '1190.40', gastos_netos: '1190.40', balance: '229.60', ahorro_pct: '16.17' };

type Rpc = Record<string, (args: Record<string, unknown>) => unknown>;

function servir(rpc: Rpc, tablas: Record<string, unknown> = {}, inicioDatos = '2026-08-01') {
  estado.responder = (ll: Llamada): Respuesta => {
    if (ll.origen === 'rpc') {
      const f = rpc[ll.nombre];
      return { data: f ? f(ll.args ?? {}) : [], error: null };
    }
    if (ll.nombre === 'perfiles') return { data: PERFIL, error: null };
    if (ll.nombre === 'cuentas') {
      return { data: [{ id: 'c1', nombre: 'BBVA', fecha_inicial: inicioDatos, saldo_inicial: '1000.00' }], error: null };
    }
    if (ll.nombre === 'v_saldos') return { data: [], error: null };
    return { data: tablas[ll.nombre] ?? [], error: null };
  };
}

const resumenPor = (porDesde: Record<string, unknown>) => (a: Record<string, unknown>) =>
  porDesde[String(a.p_desde)] ?? CEROS;

function montar() {
  return renderConApp(<PaginaEstadisticas />, { sesion: sesionFalsa(), ruta: '/estadisticas' });
}

async function elegirMes(nombre: string) {
  const selector = await screen.findByRole('combobox', { name: 'Mes' });
  await waitFor(() => expect(within(selector).getByRole('option', { name: nombre })).toBeInTheDocument());
  await userEvent.selectOptions(selector, nombre);
}

beforeEach(() => {
  reiniciar();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const normal = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

describe('Estadísticas: sin tarjetas de cifras, los gráficos primero', () => {
  it('no pinta la fila de tarjetas KPI (gastos netos / ingresos / balance)', async () => {
    servir({ resumen_periodo: () => SEPTIEMBRE });
    montar();
    await screen.findByRole('table', { name: 'Gasto neto por día' });
    expect(screen.queryByRole('region', { name: /Comparativa/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Gastos netos ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Ingresos ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Balance ·/)).not.toBeInTheDocument();
    // Las pestañas y el selector de mes siguen ahí.
    expect(screen.getByRole('radio', { name: 'Gastos' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Mes' })).toBeInTheDocument();
  });

  it('mes en curso: el total del gráfico diario es 1–19 oct contra 1–19 sept', async () => {
    servir({ resumen_periodo: resumenPor({ '2026-10-01': SEPTIEMBRE, '2026-09-01': AGOSTO }) });
    montar();
    const total = await screen.findByTestId('total-tramo');
    expect(normal(total.textContent)).toContain('Total 1–19 oct: 1.168,28 € · provisional, hasta hoy');
    expect(normal(total.textContent)).toContain('-1,9 %');
    expect(normal(total.textContent)).toContain('vs 1.190,40 € (1–19 sept)');
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'resumen_periodo', args: { p_desde: '2026-10-01', p_hasta: '2026-10-19' } }),
    );
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'resumen_periodo', args: { p_desde: '2026-09-01', p_hasta: '2026-09-19' } }),
    );
  });

  it('pide los importes como texto, también en funciones que devuelven tabla', async () => {
    servir({ resumen_periodo: () => SEPTIEMBRE });
    montar();
    await screen.findByTestId('total-tramo');
    await waitFor(() => expect(estado.llamadas.some((l) => l.nombre === 'gasto_por_dia')).toBe(true));
    const rpc = estado.llamadas.filter((l) => l.origen === 'rpc');
    expect(rpc.length).toBeGreaterThan(0);
    for (const l of rpc) expect(columnas(l)).not.toMatch(/(^|, )(ingresos|gasto|gasto_neto|importe|balance)(,|$)/);
    expect(columnas(rpc.find((l) => l.nombre === 'resumen_periodo') as Llamada)).toContain('balance::text');
    expect(columnas(rpc.find((l) => l.nombre === 'gasto_por_dia') as Llamada)).toBe('fecha, gasto_neto::text');
    // Ya no se descargan movimientos sueltos para agregarlos en el cliente.
    expect(estado.llamadas.some((l) => l.nombre === 'movimientos')).toBe(false);
  });

  it('base cero: «Sin datos del mes anterior» en lugar de porcentaje', async () => {
    servir({ resumen_periodo: resumenPor({ '2026-10-01': SEPTIEMBRE }) });
    montar();
    const total = await screen.findByTestId('total-tramo');
    expect(within(total).getByText('Sin datos del mes anterior')).toBeInTheDocument();
    expect(normal(total.textContent)).not.toMatch(/%/);
  });

  it('datos desde el 25/09: el 27/10 no hay % (1–27 sept está incompleto y ni se pide)', async () => {
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    servir({ resumen_periodo: resumenPor({ '2026-10-01': SEPTIEMBRE, '2026-09-01': AGOSTO }) }, {}, '2026-09-25');
    montar();
    const total = await screen.findByTestId('total-tramo');
    expect(within(total).getByText('Sin datos del mes anterior')).toBeInTheDocument();
    expect(estado.llamadas.some((l) => l.nombre === 'resumen_periodo' && l.args?.p_desde === '2026-09-01')).toBe(false);
  });

  it('color por significado: bajan los gastos → verde; suben los ingresos → verde', async () => {
    servir({ resumen_periodo: resumenPor({ '2026-09-01': SEPTIEMBRE, '2026-08-01': AGOSTO }) });
    montar();
    await elegirMes('Septiembre de 2026');
    // Gastos netos 1.190,40 → 1.168,28: −1,9 %. Mes cerrado: mes completo contra mes completo.
    const gastos = await screen.findByTestId('total-tramo');
    await within(gastos).findByText('-1,9 %');
    expect(normal(gastos.textContent)).toContain('Total septiembre de 2026: 1.168,28 €');
    expect(within(gastos).getByText('-1,9 %').parentElement).toHaveClass('text-positivo');
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'resumen_periodo', args: { p_desde: '2026-08-01', p_hasta: '2026-08-31' } }),
    );
    // Ingresos 1.420 → 1.508: +6,2 %.
    await userEvent.click(screen.getByRole('radio', { name: 'Ingresos' }));
    const ingresos = await screen.findByTestId('total-tramo');
    await within(ingresos).findByText('+6,2 %');
    expect(normal(ingresos.textContent)).toContain('Total septiembre de 2026: 1.508,00 €');
    expect(within(ingresos).getByText('+6,2 %').parentElement).toHaveClass('text-positivo');
  });
});

describe('Estadísticas: balance (sección 11)', () => {
  const MENSUAL = [
    { mes: '2026-08-01', ...AGOSTO },
    { mes: '2026-09-01', ...SEPTIEMBRE },
  ];

  it('septiembre: 339,72 €, ahorro 22,5 % y +48,0 % frente a agosto', async () => {
    servir({ resumen_periodo: resumenPor({ '2026-09-01': SEPTIEMBRE, '2026-08-01': AGOSTO }), resumen_mensual: () => MENSUAL });
    montar();
    await elegirMes('Septiembre de 2026');
    await userEvent.click(screen.getByRole('radio', { name: 'Balance' }));
    const lectura = await screen.findByTestId('lectura-balance');
    const texto = normal(lectura.textContent);
    expect(texto).toContain('Septiembre de 2026 · +339,72 €');
    expect(texto).toContain('Ahorro 22,5 %');
    // 229,60 → 339,72: +48,0 %, verde (sube el balance).
    expect(texto).toContain('+48,0 %');
    expect(texto).toContain('vs 229,60 € (agosto de 2026)');
    expect(within(lectura).getByText('+48,0 %').parentElement).toHaveClass('text-positivo');
    // Se pide un mes más (julio no tiene datos: empiezan en agosto).
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'resumen_mensual', args: { p_desde: '2026-08-01', p_hasta: '2026-09-30' } }),
    );
  });

  it('mes sin ingresos: el ahorro muestra «—» y el balance negativo lleva signo menos', async () => {
    const NEGATIVO = { ...CEROS, gastos: '50.00', gastos_netos: '50.00', balance: '-50.00' };
    servir({ resumen_periodo: () => NEGATIVO, resumen_mensual: () => [{ mes: '2026-09-01', ...NEGATIVO }] });
    montar();
    await elegirMes('Septiembre de 2026');
    await userEvent.click(screen.getByRole('radio', { name: 'Balance' }));
    const lectura = await screen.findByTestId('lectura-balance');
    expect(normal(lectura.textContent)).toContain('Septiembre de 2026 · -50,00 €');
    expect(normal(lectura.textContent)).toContain('Ahorro —');
    // Etiqueta de la barra en rojo.
    const barras = screen.getByTestId('superficie-balance');
    expect(within(barras).getByText('-50,00 €')).toHaveClass('text-negativo');
  });

  it('mes en curso: se compara con el mismo tramo del mes anterior, no con el mes completo', async () => {
    servir({
      resumen_periodo: resumenPor({ '2026-09-01': { ...AGOSTO, balance: '200.00' } }),
      resumen_mensual: () => [...MENSUAL, { mes: '2026-10-01', ...CEROS, ingresos: '300.00', balance: '300.00', ahorro_pct: '100' }],
    });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    const lectura = await screen.findByTestId('lectura-balance');
    await waitFor(() => expect(normal(lectura.textContent)).toContain('vs 200,00 € (1–19 sept)'));
    expect(normal(lectura.textContent)).toContain('Octubre de 2026 · hasta hoy (provisional) · +300,00 €');
    expect(normal(lectura.textContent)).toContain('+50,0 %');
  });
});

describe('Estadísticas: gastos', () => {
  it('categoría en negativo (−30,00 €) listada aparte y fuera del gráfico', async () => {
    servir({
      resumen_periodo: () => SEPTIEMBRE,
      gasto_por_categoria: () => [
        { categoria_id: 'ocio', nombre: 'Ocio', color: '#9b6bff', gasto: '40.00' },
        { categoria_id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', gasto: '-30.00' },
      ],
      gasto_por_metodo: () => [{ metodo: 'tarjeta', gasto: '100.00' }],
    });
    montar();
    const grafico = await screen.findByRole('list', { name: 'Gasto neto por categoría' });
    expect(within(grafico).getByText('Ocio')).toBeInTheDocument();
    expect(within(grafico).queryByText('Otros gastos')).not.toBeInTheDocument();
    const negativas = screen.getByRole('list', { name: 'Categorías en negativo' });
    expect(within(negativas).getByText(/Otros gastos/)).toBeInTheDocument();
    expect(within(negativas).getByText('-30,00 €')).toBeInTheDocument();
    // «Cómo pagas» avisa de que las devoluciones no restan.
    expect(screen.getByText(/las devoluciones no restan aquí/)).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
  });

  it('gasto por día (RPC gasto_por_dia) con tabla accesible', async () => {
    servir({
      resumen_periodo: () => SEPTIEMBRE,
      gasto_por_dia: () => [{ fecha: '2026-10-03', gasto_neto: '40.00' }],
    });
    montar();
    const tabla = await screen.findByRole('table', { name: 'Gasto neto por día' });
    const fila = within(tabla).getByRole('row', { name: /^3 oct 2026/ });
    expect(fila).toHaveTextContent('40,00 €');
    // Solo hasta hoy (19 días): los días futuros no están.
    expect(within(tabla).getAllByRole('row')).toHaveLength(20);
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'gasto_por_dia', args: { p_desde: '2026-10-01', p_hasta: '2026-10-19' } }),
    );
  });
});

describe('Estadísticas: ingresos y balance', () => {
  it('ingresos por categoría de ingreso (RPC ingresos_por_categoria)', async () => {
    servir({
      resumen_periodo: () => SEPTIEMBRE,
      ingresos_por_categoria: () => [
        { categoria_id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', icono: null, ingreso: '1258.00' },
      ],
    });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Ingresos' }));
    const lista = await screen.findByRole('list', { name: 'Ingresos por categoría' });
    expect(within(lista).getByText('Nómina')).toBeInTheDocument();
    expect(within(lista).getByText('1.258,00 € · 100,0 %')).toBeInTheDocument();
    const llamada = estado.llamadas.find((l) => l.nombre === 'ingresos_por_categoria') as Llamada;
    expect(columnas(llamada)).toBe('categoria_id, nombre, color, ingreso::text');
    expect(estado.llamadas.some((l) => l.nombre === 'movimientos')).toBe(false);
  });

  it('balance por mes, media de meses completos, variación patrimonial aparte y sin interanual', async () => {
    servir({
      resumen_periodo: () => SEPTIEMBRE,
      resumen_mensual: () => [
        { mes: '2026-08-01', ...AGOSTO },
        { mes: '2026-09-01', ...SEPTIEMBRE },
        { mes: '2026-10-01', ...CEROS, ingresos: '100.00', balance: '100.00', ahorro_pct: '100' },
      ],
      variacion_patrimonial: () => ({
        patrimonio_inicial: '2000.00',
        patrimonio_final: '2367.16',
        balance: '339.72',
        revalorizacion: '27.44',
        ajustes: '0.00',
        saldos_iniciales: '0.00',
        variacion: '367.16',
      }),
    });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    expect(
      await screen.findByText('Media mensual (solo meses completos): 284,66 €. El mes en curso es provisional.'),
    ).toBeInTheDocument();
    const tabla = screen.getByRole('table', { name: 'Balance por mes' });
    expect(within(tabla).getByRole('row', { name: /Octubre de 2026/ })).toHaveTextContent('(hasta hoy)');

    // Mes en curso → variación del último mes cerrado (septiembre): d1 = 31/08, d2 = 30/09.
    const tarjeta = (await screen.findByText('Variación patrimonial · septiembre')).closest('section') as HTMLElement;
    expect(within(tarjeta).getByText('Traspasos entre tus cuentas').nextSibling).toHaveTextContent('0,00 €');
    expect(within(tarjeta).getByText('+27,44 €')).toBeInTheDocument();
    expect(within(tarjeta).getByText('+367,16 €')).toBeInTheDocument();
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'variacion_patrimonial', args: { p_d1: '2026-08-31', p_d2: '2026-09-30' } }),
    );
    // Menos de 12 meses de datos: no hay interanual.
    expect(screen.queryByText(/Interanual/)).not.toBeInTheDocument();
  });
});
