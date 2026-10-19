import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import PaginaEstadisticas from './pages/PaginaEstadisticas';
import { columnas, estado, PERFIL, reiniciar, type Llamada, type Respuesta } from './test/supabaseFalso';

vi.mock('@/shared/lib/supabase', async () => (await import('./test/supabaseFalso')).moduloFalso);

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

function servir(rpc: Rpc, tablas: Record<string, unknown> = {}) {
  estado.responder = (ll: Llamada): Respuesta => {
    if (ll.origen === 'rpc') {
      const f = rpc[ll.nombre];
      return { data: f ? f(ll.args ?? {}) : [], error: null };
    }
    if (ll.nombre === 'perfiles') return { data: PERFIL, error: null };
    if (ll.nombre === 'cuentas') {
      return { data: [{ id: 'c1', nombre: 'BBVA', fecha_inicial: '2026-08-01', saldo_inicial: '1000.00' }], error: null };
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

describe('Estadísticas: comparativa', () => {
  it('balance de septiembre (sección 11): 339,72 € y ahorro 22,5 %', async () => {
    servir({ resumen_periodo: resumenPor({ '2026-09-01': SEPTIEMBRE, '2026-08-01': AGOSTO }) });
    montar();
    await elegirMes('Septiembre de 2026');
    const comparativa = await screen.findByRole('region', { name: /Comparativa/ });
    await within(comparativa).findByText('+339,72 €');
    expect(within(comparativa).getByText('1.508,00 €')).toBeInTheDocument();
    expect(within(comparativa).getByText('1.168,28 €')).toBeInTheDocument();
    expect(within(comparativa).getByText('Ahorro 22,5 %')).toBeInTheDocument();
    // Mes cerrado: mes completo contra mes completo.
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'resumen_periodo', args: { p_desde: '2026-08-01', p_hasta: '2026-08-31' } }),
    );
  });

  it('pide los importes como texto, también en funciones que devuelven tabla', async () => {
    servir({ resumen_periodo: () => SEPTIEMBRE });
    montar();
    await screen.findByText('Ahorro 22,5 % · provisional, hasta hoy');
    const rpc = estado.llamadas.filter((l) => l.origen === 'rpc' || l.nombre === 'movimientos');
    expect(rpc.length).toBeGreaterThan(0);
    for (const l of rpc) expect(columnas(l)).not.toMatch(/(^|, )(ingresos|gasto|importe|balance)(,|$)/);
    expect(columnas(rpc.find((l) => l.nombre === 'resumen_periodo') as Llamada)).toContain('balance::text');
    expect(columnas(rpc.find((l) => l.nombre === 'movimientos') as Llamada)).toBe('fecha, tipo, importe::text, categoria_id');
  });

  it('mes en curso: 1–19 oct contra 1–19 sept', async () => {
    servir({ resumen_periodo: () => SEPTIEMBRE });
    montar();
    expect(await screen.findByText('Gastos netos · 1–19 oct')).toBeInTheDocument();
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'resumen_periodo', args: { p_desde: '2026-10-01', p_hasta: '2026-10-19' } }),
    );
    expect(estado.llamadas).toContainEqual(
      expect.objectContaining({ nombre: 'resumen_periodo', args: { p_desde: '2026-09-01', p_hasta: '2026-09-19' } }),
    );
  });

  it('mes sin ingresos: el ahorro muestra «—»', async () => {
    servir({ resumen_periodo: () => ({ ...CEROS, gastos: '50.00', gastos_netos: '50.00', balance: '-50.00' }) });
    montar();
    expect(await screen.findByText(/^Ahorro —/)).toBeInTheDocument();
    // Balance negativo con signo menos.
    expect(screen.getByText('-50,00 €')).toHaveClass('text-negativo');
  });

  it('base cero: «Sin datos del mes anterior» en lugar de porcentaje', async () => {
    servir({ resumen_periodo: resumenPor({ '2026-10-01': SEPTIEMBRE }) });
    montar();
    const comparativa = await screen.findByRole('region', { name: /Comparativa/ });
    await within(comparativa).findByText('+339,72 €');
    // Septiembre (anterior) a 0 € en todo → las tres tarjetas sin porcentaje.
    expect(within(comparativa).getAllByText('Sin datos del mes anterior')).toHaveLength(3);
    expect(within(comparativa).queryByText(/%.*vs/)).not.toBeInTheDocument();
  });

  it('color por significado: suben los gastos → rojo; suben los ingresos → verde', async () => {
    servir({ resumen_periodo: resumenPor({ '2026-09-01': SEPTIEMBRE, '2026-08-01': AGOSTO }) });
    montar();
    await elegirMes('Septiembre de 2026');
    const comparativa = await screen.findByRole('region', { name: /Comparativa/ });
    await within(comparativa).findByText('+339,72 €');
    // Ingresos 1.420 → 1.508: +6,2 %. Gastos netos 1.190,40 → 1.168,28: −1,9 %.
    expect(within(comparativa).getByText('+6,2 %').parentElement).toHaveClass('text-positivo');
    expect(within(comparativa).getByText('-1,9 %').parentElement).toHaveClass('text-positivo');
    expect(within(comparativa).getByText('+48,0 %').parentElement).toHaveClass('text-positivo');
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

  it('gasto por día con tabla accesible; el traspaso no cuenta', async () => {
    servir(
      { resumen_periodo: () => SEPTIEMBRE },
      {
        movimientos: [
          { fecha: '2026-10-03', tipo: 'gasto', importe: '100.00', categoria_id: 'ocio' },
          { fecha: '2026-10-03', tipo: 'devolucion', importe: '60.00', categoria_id: 'ocio' },
          { fecha: '2026-10-03', tipo: 'traspaso', importe: '100.00', categoria_id: null },
        ],
      },
    );
    montar();
    const tabla = await screen.findByRole('table', { name: 'Gasto neto por día' });
    const fila = within(tabla).getByRole('row', { name: /^3 oct 2026/ });
    expect(fila).toHaveTextContent('40,00 €');
    // Solo hasta hoy (19 días): los días futuros no están.
    expect(within(tabla).getAllByRole('row')).toHaveLength(20);
  });
});

describe('Estadísticas: ingresos y balance', () => {
  it('ingresos por categoría de ingreso, sin devoluciones', async () => {
    servir(
      { resumen_periodo: () => SEPTIEMBRE },
      {
        movimientos: [
          { fecha: '2026-10-01', tipo: 'ingreso', importe: '1258.00', categoria_id: 'nomina' },
          { fecha: '2026-10-02', tipo: 'devolucion', importe: '24.00', categoria_id: 'ocio' },
        ],
        categorias: [
          { id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', tipo: 'ingreso', orden: 1 },
          { id: 'ocio', nombre: 'Ocio', color: '#9b6bff', tipo: 'gasto', orden: 2 },
        ],
      },
    );
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Ingresos' }));
    const lista = await screen.findByRole('list', { name: 'Ingresos por categoría' });
    expect(within(lista).getByText('Nómina')).toBeInTheDocument();
    expect(within(lista).getByText('1.258,00 € · 100,0 %')).toBeInTheDocument();
    expect(within(lista).queryByText('Ocio')).not.toBeInTheDocument();
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
