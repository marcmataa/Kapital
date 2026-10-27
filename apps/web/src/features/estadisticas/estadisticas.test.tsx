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

/** Respuesta de comparativa_estadisticas (todo calculado en SQL). */
const COMPARATIVA = {
  gastos_netos: '1168.28',
  gastos_netos_anterior: '1038.47',
  variacion_gastos: '12.5001',
  ingresos: '1508.00',
  ingresos_anterior: '1420.00',
  variacion_ingresos: '6.1972',
  balance: '339.72',
  balance_anterior: '229.60',
  variacion_balance: '47.9617',
  dias: 19,
  gasto_medio_diario: '61.4884210526315789',
  mayor_concepto: 'Alquiler',
  mayor_importe: '700.00',
};
const SIN_ANTERIOR = {
  ...COMPARATIVA,
  gastos_netos_anterior: null,
  variacion_gastos: null,
  ingresos_anterior: null,
  variacion_ingresos: null,
  balance_anterior: null,
  variacion_balance: null,
};

/** Respuesta de ritmo_gasto (SQL): 1–19 oct contra 1–19 sept, mes en curso con proyección. */
const RITMO = {
  devoluciones: '60.00',
  gasto_medio_diario: '61.4884210526315789',
  gasto_medio_diario_anterior: '54.6563157894736842',
  variacion_medio_diario: '12.5001',
  dias_mes: 31,
  proyeccion_fin_mes: '1906.1410526315789474',
};

type Rpc = Record<string, (args: Record<string, unknown>) => unknown>;

function servir(rpc: Rpc, inicioDatos = '2026-08-01') {
  const base: Rpc = { comparativa_estadisticas: () => COMPARATIVA, resumen_periodo: () => CEROS, ritmo_gasto: () => RITMO };
  estado.responder = (ll: Llamada): Respuesta => {
    if (ll.origen === 'rpc') {
      const f = rpc[ll.nombre] ?? base[ll.nombre];
      return { data: f ? f(ll.args ?? {}) : [], error: null };
    }
    if (ll.nombre === 'perfiles') return { data: PERFIL, error: null };
    if (ll.nombre === 'cuentas') {
      return { data: [{ id: 'c1', nombre: 'BBVA', fecha_inicial: inicioDatos, saldo_inicial: '1000.00' }], error: null };
    }
    if (ll.nombre === 'v_saldos') return { data: [], error: null };
    return { data: [], error: null };
  };
}

const llamadas = (nombre: string) => estado.llamadas.filter((l) => l.nombre === nombre);
const normal = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

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

describe('Estadísticas: gastos', () => {
  it('sin fila de tarjetas KPI: primero el gráfico por día; pestañas y selector siguen', async () => {
    servir({});
    montar();
    expect(await screen.findByRole('heading', { name: 'Gasto por día · Octubre de 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Comparativa con el mismo tramo/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Gastos netos ·/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Gastos' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Mes' })).toBeInTheDocument();
  });

  it('mes en curso: comparativa al día 19 (1–19 oct vs 1–19 sept), solo gastos y gasto medio diario', async () => {
    servir({});
    montar();
    expect(await screen.findByText('Comparativa con el mes anterior al día 19')).toBeInTheDocument();
    const tarjetas = screen.getByTestId('comparativa-gastos');
    expect(within(tarjetas).getByText('1.168,28 €')).toBeInTheDocument();
    // Suben los gastos (+12,5 %, de SQL) → rojo.
    // (el gasto medio diario sube lo mismo: mismos días en los dos tramos).
    for (const pct of within(tarjetas).getAllByText('+12,5 %')) expect(pct.parentElement).toHaveClass('text-negativo');
    // «vs Y el mes pasado», con el % aparte (nada de «antes»).
    expect(within(tarjetas).getByText('vs 1.038,47 € el mes pasado')).toBeInTheDocument();
    expect(within(tarjetas).queryByText(/antes/)).not.toBeInTheDocument();
    expect(within(tarjetas).getByText('Gasto medio diario')).toBeInTheDocument();
    expect(within(tarjetas).getByText('61,49 €')).toBeInTheDocument();
    // Gasto diario comparado con el del mes anterior (ritmo_gasto).
    expect(within(tarjetas).getByTestId('medio-diario-anterior')).toHaveTextContent('vs 54,66 €/día el mes pasado');
    // Proyección a fin de mes (SQL), redondeada al mostrar.
    const proyeccion = within(tarjetas).getByTestId('proyeccion-fin-mes');
    expect(proyeccion).toHaveTextContent('Proyección a fin de mes');
    expect(proyeccion).toHaveTextContent('1.906,14 €');
    expect(proyeccion).toHaveTextContent('los 31 días del mes');
    // Devoluciones: ahora en Gastos (decisión del usuario).
    expect(screen.getByTestId('devoluciones-mes')).toHaveTextContent('Te devolvieron 60,00 € este mes');
    expect(llamadas('ritmo_gasto')).toContainEqual(
      expect.objectContaining({
        args: { p_desde: '2026-10-01', p_hasta: '2026-10-19', p_desde_ant: '2026-09-01', p_hasta_ant: '2026-09-19' },
      }),
    );
    expect(columnas(llamadas('ritmo_gasto')[0] as Llamada)).toBe(
      'devoluciones::text, gasto_medio_diario::text, gasto_medio_diario_anterior::text, variacion_medio_diario::text, dias_mes, proyeccion_fin_mes::text',
    );
    expect(within(tarjetas).getByText('Mayor gasto individual: Alquiler (700,00 €)')).toBeInTheDocument();
    expect(within(tarjetas).queryByText('Ingresos')).not.toBeInTheDocument();
    expect(within(tarjetas).queryByText('Ahorro')).not.toBeInTheDocument();
    expect(llamadas('comparativa_estadisticas')).toContainEqual(
      expect.objectContaining({
        args: { p_desde: '2026-10-01', p_hasta: '2026-10-19', p_desde_ant: '2026-09-01', p_hasta_ant: '2026-09-19' },
      }),
    );
  });

  it('mes cerrado: «con agosto completo», mes entero contra mes entero; bajan los gastos → verde', async () => {
    servir({
      comparativa_estadisticas: () => ({ ...COMPARATIVA, variacion_gastos: '-1.8582', gastos_netos_anterior: '1190.40' }),
      // Mes cerrado: ritmo_gasto no proyecta.
      ritmo_gasto: () => ({ ...RITMO, proyeccion_fin_mes: null, dias_mes: 30 }),
    });
    montar();
    await elegirMes('Septiembre de 2026');
    expect(await screen.findByText('Comparativa con agosto completo')).toBeInTheDocument();
    const tarjetas = screen.getByTestId('comparativa-gastos');
    expect(within(tarjetas).getByText('-1,9 %').parentElement).toHaveClass('text-positivo');
    expect(within(tarjetas).queryByTestId('proyeccion-fin-mes')).not.toBeInTheDocument();
    expect(await screen.findByTestId('devoluciones-mes')).toHaveTextContent('Te devolvieron 60,00 € en septiembre');
    expect(llamadas('comparativa_estadisticas')).toContainEqual(
      expect.objectContaining({
        args: { p_desde: '2026-09-01', p_hasta: '2026-09-30', p_desde_ant: '2026-08-01', p_hasta_ant: '2026-08-31' },
      }),
    );
  });

  it('datos desde el 25/09: el 27/10 no hay tramo anterior ni % («Sin datos del mes anterior»)', async () => {
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    servir(
      {
        comparativa_estadisticas: () => SIN_ANTERIOR,
        ritmo_gasto: () => ({ ...RITMO, devoluciones: '0.00', gasto_medio_diario_anterior: null, variacion_medio_diario: null }),
      },
      '2026-09-25',
    );
    montar();
    const tarjetas = await screen.findByTestId('comparativa-gastos');
    expect(within(tarjetas).getByText('Sin datos del mes anterior')).toBeInTheDocument();
    expect(within(tarjetas).queryByText(/el mes pasado/)).not.toBeInTheDocument();
    // Sin devoluciones no hay línea «Te devolvieron…».
    expect(screen.queryByTestId('devoluciones-mes')).not.toBeInTheDocument();
    expect(llamadas('comparativa_estadisticas').every((l) => !('p_desde_ant' in (l.args ?? {})))).toBe(true);
  });

  it('pide los importes como texto, también en funciones que devuelven tabla', async () => {
    servir({});
    montar();
    await screen.findByTestId('comparativa-gastos');
    await waitFor(() => expect(llamadas('movimientos_por_dia').length).toBeGreaterThan(0));
    await waitFor(() => expect(llamadas('gasto_por_metodo').length).toBeGreaterThan(0));
    const rpc = estado.llamadas.filter((l) => l.origen === 'rpc');
    for (const l of rpc) {
      expect(columnas(l)).not.toMatch(/(^|, )(ingresos|gasto|gastos|gasto_neto|importe|balance|devoluciones|gastos_netos)(,|$)/);
    }
    expect(columnas(llamadas('movimientos_por_dia')[0] as Llamada)).toBe(
      'fecha, gastos::text, devoluciones::text, gasto_neto::text, ingresos::text, movimientos',
    );
    expect(columnas(llamadas('comparativa_estadisticas')[0] as Llamada)).toContain('gasto_medio_diario::text');
    expect(estado.llamadas.some((l) => l.nombre === 'movimientos')).toBe(false);
  });

  it('gasto por día con la lista del día (movimientos_por_dia) y tabla accesible', async () => {
    servir({
      movimientos_por_dia: () => [
        {
          fecha: '2026-10-03',
          gastos: '50.00',
          devoluciones: '10.00',
          gasto_neto: '40.00',
          ingresos: '0.00',
          movimientos: [
            { id: 'm1', tipo: 'gasto', concepto: 'Cena', importe: '50.00' },
            { id: 'm2', tipo: 'devolucion', concepto: 'Ana', importe: '10.00' },
          ],
        },
      ],
    });
    montar();
    const tabla = await screen.findByRole('table', { name: 'Gasto por día · Octubre de 2026' });
    expect(within(tabla).getByRole('row', { name: /^3 oct 2026/ })).toHaveTextContent('40,00 €');
    expect(within(tabla).getAllByRole('row')).toHaveLength(20);
    const control = screen.getByRole('slider', { name: 'Día del gráfico' });
    control.focus();
    await userEvent.keyboard('{Home}{ArrowRight}{ArrowRight}');
    const lectura = normal(screen.getByTestId('lectura-diario').textContent);
    expect(lectura).toContain('Gastos 50,00 € · Devoluciones -10,00 € · Neto 40,00 €');
    expect(lectura).not.toContain('Cena');
  });

  it('categorías este mes vs anterior; la negativa aparte; método de pago en filas; últimos 6 meses', async () => {
    servir({
      gasto_por_categoria: (a) =>
        a.p_desde === '2026-10-01'
          ? [
              { categoria_id: 'ocio', nombre: 'Ocio', color: '#9b6bff', gasto: '40.00' },
              { categoria_id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', gasto: '-30.00' },
            ]
          : [{ categoria_id: 'ocio', nombre: 'Ocio', color: '#9b6bff', gasto: '25.00' }],
      gasto_por_metodo: () => [
        { metodo: 'efectivo', gasto: '20.00' },
        { metodo: 'tarjeta', gasto: '100.00' },
      ],
      resumen_mensual: () => [
        { mes: '2026-09-01', ...SEPTIEMBRE },
        { mes: '2026-10-01', ...CEROS, gastos: '80.00', gastos_netos: '80.00', balance: '-80.00' },
      ],
    });
    montar();
    expect(await screen.findByText('Categorías: este mes vs mes anterior al día 19')).toBeInTheDocument();
    const lista = await screen.findByRole('list', { name: 'Gasto neto por categoría' });
    const ocio = within(lista).getByText('Ocio').closest('li') as HTMLElement;
    expect(normal(ocio.textContent)).toContain('40,00 €');
    expect(normal(ocio.textContent)).toContain('antes 25,00 €');
    expect(within(lista).queryByText('Otros gastos')).not.toBeInTheDocument();
    const negativas = screen.getByRole('list', { name: 'Categorías en negativo' });
    expect(within(negativas).getByText('-30,00 €')).toBeInTheDocument();
    // Métodos: de mayor a menor.
    const metodos = await screen.findByRole('list', { name: 'Gasto bruto por método de pago' });
    expect(within(metodos).getAllByRole('listitem').map((li) => normal(li.textContent))).toEqual([
      'Tarjeta100,00 €',
      'Efectivo20,00 €',
    ]);
    expect(screen.getByText(/sin restar devoluciones: no es el gasto neto/)).toBeInTheDocument();
    // Mes en curso: lo que llevas, el mes anterior al mismo día y la proyección (comparativa y ritmo, SQL).
    const lecturaMeses = await screen.findByTestId('lectura-meses');
    expect(lecturaMeses).toHaveTextContent('Octubre de 2026 · hasta hoy (provisional) · 80,00 €');
    expect(lecturaMeses).toHaveTextContent('Septiembre al día 19: 1.038,47 € · Proyección a fin de mes: 1.906,14 €');
    expect(screen.getByTestId('marca-referencia')).toHaveAttribute('data-importe', '1038.47');
    expect(screen.getByTestId('proyeccion-mes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gasto neto mensual · desde septiembre' })).toBeInTheDocument();
  });

  it('mes cerrado: sin «hoy» ni «provisional» en las notas, sin marca ni proyección', async () => {
    servir({
      resumen_mensual: () => [
        { mes: '2026-08-01', ...AGOSTO },
        { mes: '2026-09-01', ...SEPTIEMBRE },
      ],
    });
    montar();
    await elegirMes('Septiembre de 2026');
    expect(await screen.findByText('Gasto neto de cada día: gastos menos devoluciones.')).toBeInTheDocument();
    expect(await screen.findByText('Gasto neto de cada mes.')).toBeInTheDocument();
    expect(screen.queryByText(/provisional|futuros/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('marca-referencia')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proyeccion-mes')).not.toBeInTheDocument();
  });
});

describe('Estadísticas: ingresos', () => {
  // movimientos_por_dia (SQL): un ingreso y, el mismo día, una devolución que no debe salir aquí.
  const POR_DIA = () => [
    {
      fecha: '2026-10-01',
      gastos: '0.00',
      devoluciones: '15.00',
      gasto_neto: '-15.00',
      ingresos: '1258.00',
      movimientos: [
        { id: 'm1', tipo: 'ingreso', concepto: 'Nómina inventada', importe: '1258.00' },
        { id: 'm2', tipo: 'devolucion', concepto: 'Devolución inventada', importe: '15.00' },
      ],
    },
  ];

  it('lista de ingresos del mes (no la serie diaria) e histórico mensual de ingresos', async () => {
    servir({
      movimientos_por_dia: POR_DIA,
      resumen_mensual: () => [
        { mes: '2026-09-01', ...SEPTIEMBRE },
        { mes: '2026-10-01', ...CEROS, ingresos: '1258.00', balance: '1258.00' },
      ],
    });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Ingresos' }));
    const lista = await screen.findByRole('list', { name: 'Ingresos de octubre' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1);
    expect(within(lista).getByRole('listitem')).toHaveTextContent('Nómina inventada');
    expect(within(lista).getByRole('listitem')).toHaveTextContent('+1.258,00 €');
    expect(screen.queryByRole('heading', { name: /Ingresos por día/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ingresos mensuales · desde septiembre' })).toBeInTheDocument();
    expect(screen.getByTestId('marca-referencia')).toHaveAttribute('data-importe', '1420.00');
    // Con una sola categoría de ingreso, el reparto repetiría el total: no sale.
    expect(screen.queryByRole('list', { name: 'Ingresos por categoría' })).not.toBeInTheDocument();
  });

  it('comparativa solo de ingresos; reparto por categoría con más de una; sin devoluciones', async () => {
    servir({
      movimientos_por_dia: POR_DIA,
      ingresos_por_categoria: () => [
        { categoria_id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', icono: null, ingreso: '1258.00' },
        { categoria_id: 'otros', nombre: 'Otros ingresos', color: '#8f9bbd', icono: null, ingreso: '250.00' },
      ],
    });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Ingresos' }));
    const tarjetas = await screen.findByTestId('comparativa-ingresos');
    expect(within(tarjetas).getByText('1.508,00 €')).toBeInTheDocument();
    expect(within(tarjetas).getByText('+6,2 %').parentElement).toHaveClass('text-positivo');
    expect(within(tarjetas).getByText('vs 1.420,00 € el mes pasado')).toBeInTheDocument();
    expect(within(tarjetas).queryByText('Gasto medio diario')).not.toBeInTheDocument();
    // Ni la devolución ni notas de devoluciones (fuera de las definiciones de los (i)).
    expect(screen.queryByText('Devolución inventada')).not.toBeInTheDocument();
    expect(screen.queryByTestId('devoluciones-mes')).not.toBeInTheDocument();
    const lista = await screen.findByRole('list', { name: 'Ingresos por categoría' });
    expect(within(lista).getByText('1.258,00 € · 83,4 %')).toBeInTheDocument();
    expect(columnas(llamadas('ingresos_por_categoria')[0] as Llamada)).toBe('categoria_id, nombre, color, ingreso::text');
  });
});

describe('Estadísticas: balance', () => {
  const BALANCE: Rpc = {
    resumen_mensual: () => [
      { mes: '2026-08-01', ...AGOSTO },
      { mes: '2026-09-01', ...SEPTIEMBRE },
      { mes: '2026-10-01', ...CEROS, gastos: '50.00', gastos_netos: '50.00', balance: '-50.00' },
    ],
    fuera_del_balance: (a) =>
      a.p_desde === '2026-10-01'
        ? [
            { tipo: 'traspaso', cuenta: 'BBVA', cuenta_destino: 'Trade Republic', sentido: null, importe: '100.00' },
            { tipo: 'ajuste', cuenta: 'BBVA', cuenta_destino: null, sentido: 'suma', importe: '7.50' },
          ]
        : [],
  };

  it('últimos 6 meses con ahorro «—» sin ingresos; sin variación patrimonial ni «Cómo pagas»', async () => {
    servir(BALANCE);
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    const lectura = await screen.findByTestId('lectura-balance');
    expect(normal(lectura.textContent)).toContain('Octubre de 2026 · hasta hoy (provisional) · balance · -50,00 €');
    expect(normal(lectura.textContent)).toContain('Tasa de ahorro —');
    expect(screen.queryByText(/Variación patrimonial/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cómo pagas|método de pago/)).not.toBeInTheDocument();
    // Menos de 12 meses de datos: no hay interanual.
    expect(screen.queryByText(/Interanual/)).not.toBeInTheDocument();
    // Seis meses como máximo, desde el primero con datos.
    expect(llamadas('resumen_mensual')).toContainEqual(
      expect.objectContaining({ args: { p_desde: '2026-08-01', p_hasta: '2026-10-31' } }),
    );
  });

  it('desglose al día 19 con balance (sección 11) y traspasos/ajustes aparte, fuera del balance', async () => {
    servir(BALANCE);
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    expect(await screen.findByText('Este mes vs mes anterior al día 19')).toBeInTheDocument();
    const balance = await screen.findByTestId('fila-balance');
    expect(within(balance).getByText('+339,72 €')).toHaveClass('text-positivo');
    // La variación vive en la cabecera; la fila del desglose solo cierra la cuenta.
    expect(normal(balance.textContent)).not.toContain('%');
    const fuera = screen.getByTestId('fuera-del-balance');
    expect(within(fuera).getByText('Traspaso BBVA → Trade Republic').closest('li')).toHaveTextContent('100,00 €');
    expect(within(fuera).getByText('Ajuste BBVA (suma)').closest('li')).toHaveTextContent('+7,50 €');
    // El balance mostrado es el de SQL: el grupo B no se le suma.
    expect(within(balance).queryByText('+447,22 €')).not.toBeInTheDocument();
    for (const nombre of ['fuera_del_balance', 'gasto_por_categoria', 'ingresos_por_categoria']) {
      expect(llamadas(nombre)).toContainEqual(expect.objectContaining({ args: { p_desde: '2026-09-01', p_hasta: '2026-09-19' } }));
    }
  });

  it('cabecera: balance, diferencia en euros al mismo día del mes anterior y tasa de ahorro de SQL', async () => {
    servir({ ...BALANCE, resumen_periodo: () => SEPTIEMBRE });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    const cabecera = await screen.findByTestId('cabecera-balance');
    expect(within(cabecera).getByRole('heading')).toHaveTextContent('Balance · 1–19 oct');
    expect(within(cabecera).getByTestId('cabecera-balance-valor')).toHaveTextContent(/^\+339,72\s€$/);
    // 229,60 → 339,72: las dos bases > 0, así que diferencia y % (sección 8).
    const linea = within(cabecera).getByTestId('linea-variacion');
    expect(linea).toHaveTextContent('+110,12 €');
    expect(linea).toHaveTextContent('(+48,0 %)');
    expect(linea).toHaveTextContent('vs +229,60 € al día 19 del mes pasado');
    expect(normal(within(cabecera).getByTestId('tasa-ahorro').textContent)).toBe('Tasa de ahorro: 22,5 % de tus ingresos');
    expect(llamadas('resumen_periodo')).toContainEqual(expect.objectContaining({ args: { p_desde: '2026-10-01', p_hasta: '2026-10-19' } }));
  });

  it('cabecera con cambio de signo: solo la diferencia en euros, sin %', async () => {
    servir({ ...BALANCE, comparativa_estadisticas: () => ({ ...COMPARATIVA, balance: '-204.13', variacion_balance: '-188.9068' }) });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    const linea = within(await screen.findByTestId('cabecera-balance')).getByTestId('linea-variacion');
    expect(linea).toHaveTextContent('-433,73 €');
    expect(linea).toHaveTextContent('vs +229,60 € al día 19 del mes pasado');
    expect(linea).not.toHaveTextContent('%');
    expect(linea.querySelector('.text-negativo')).not.toBeNull();
  });

  it('cascada: del balance de 1–19 sept al de 1–19 oct, cuadrando al céntimo', async () => {
    // Coherente: 1.420,00 − 1.190,40 = 229,60 y 1.508,00 − 1.168,28 = 339,72.
    const coherente = { ...COMPARATIVA, gastos_netos_anterior: '1190.40' };
    servir({
      ...BALANCE,
      comparativa_estadisticas: () => coherente,
      gasto_por_categoria: (a) => [
        { categoria_id: 'o', nombre: 'Ocio', color: '#9b6bff', gasto: a.p_desde === '2026-10-01' ? '1168.28' : '1190.40' },
      ],
    });
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    const cascada = await screen.findByTestId('cascada-variacion');
    const filas = within(cascada)
      .getAllByRole('row')
      .slice(1)
      .map((f) => Array.from(f.children, (c) => normal(c.textContent)).join(' | '));
    // 229,60 + 88,00 (ingresos) + 22,12 (Ocio: gastaste menos) = 339,72.
    expect(filas).toEqual([
      'Balance 1–19 sept | +229,60 € | +229,60 €',
      'Ingresos | +88,00 € | +317,60 €',
      'Ocio | +22,12 € | +339,72 €',
      'Balance 1–19 oct | +339,72 € | +339,72 €',
    ]);
    const barras = within(cascada).getAllByTestId('barra-variacion');
    expect(barras.map((b) => b.getAttribute('data-sentido'))).toEqual(['total', 'sube', 'sube', 'total']);
  });

  it('cascada que no cuadra con el balance de SQL: aviso, nunca pasos inventados', async () => {
    servir(BALANCE);
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    const cascada = await screen.findByTestId('cascada-variacion');
    expect(within(cascada).getByRole('alert')).toHaveTextContent('No se ha podido cuadrar el desglose con el balance.');
    expect(within(cascada).queryByTestId('barra-variacion')).not.toBeInTheDocument();
  });

  it('primer mes con datos: sin «vs agosto», sin cascada y «Sin datos del mes anterior»', async () => {
    servir({ ...BALANCE, comparativa_estadisticas: () => SIN_ANTERIOR }, '2026-09-01');
    montar();
    await elegirMes('Septiembre de 2026');
    await userEvent.click(screen.getByRole('radio', { name: 'Balance' }));
    expect(await screen.findByText('Desglose de septiembre')).toBeInTheDocument();
    expect(screen.queryByText(/agosto/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('cascada-variacion')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('cabecera-balance')).getByText('Sin datos del mes anterior')).toBeInTheDocument();
  });

  it('el histórico arranca en el mes elegido aunque las cuentas lleguen después (F04)', async () => {
    servir(BALANCE);
    montar();
    await userEvent.click(await screen.findByRole('radio', { name: 'Balance' }));
    const lectura = await screen.findByTestId('lectura-balance');
    await waitFor(() => expect(screen.getByTestId('superficie-balance').querySelectorAll('[data-balance]').length).toBeGreaterThan(1));
    expect(normal(lectura.textContent)).toContain('Octubre de 2026 · hasta hoy (provisional)');
    // El mes en curso lleva la marca del mes anterior al mismo día.
    expect(screen.getByTestId('marca-referencia')).toHaveAttribute('data-balance', '229.60');
  });

  it('mes cerrado: «vs agosto completo» con meses completos', async () => {
    servir(BALANCE);
    montar();
    await elegirMes('Septiembre de 2026');
    await userEvent.click(screen.getByRole('radio', { name: 'Balance' }));
    expect(await screen.findByText('Este mes vs agosto completo')).toBeInTheDocument();
    expect(llamadas('fuera_del_balance')).toContainEqual(
      expect.objectContaining({ args: { p_desde: '2026-08-01', p_hasta: '2026-08-31' } }),
    );
  });
});
