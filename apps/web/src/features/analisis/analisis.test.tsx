import { Route, Routes } from 'react-router';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import PaginaAnalisis from './pages/PaginaAnalisis';
import PaginaAnalisisMes from './pages/PaginaAnalisisMes';
import { columnas, estado, PERFIL, reiniciar, type Llamada, type Respuesta } from '@/test/supabaseFalso';

vi.mock('@/shared/lib/supabase', async () => (await import('@/test/supabaseFalso')).moduloFalso);

const RESUMEN = {
  ingresos: '1508.00',
  gastos: '1228.28',
  devoluciones: '60.00',
  gastos_netos: '1168.28',
  balance: '339.72',
  ahorro_pct: '22.5278514588859416',
  ajustes: '0.00',
};

const DATOS = {
  mes: '2026-09-01',
  mes_incompleto: false,
  idioma: 'es',
  resumen: RESUMEN,
  resumen_mes_anterior: { ...RESUMEN, ingresos: '1420.00', gastos_netos: '1190.40', balance: '229.60' },
  categorias: [
    { nombre: 'Restaurantes', color: '#ff8a3d', gasto: '1158.28' },
    { nombre: 'Ocio', color: '#9b6bff', gasto: '40.00' },
    { nombre: 'Otros gastos', color: null, gasto: '-30.00' },
  ],
  cascada: [
    { tipo: 'ingresos', nombre: null, clave: null, color: null, importe: '1508.00', inicio: '0.00', fin: '1508.00' },
    { tipo: 'categoria', nombre: 'Restaurantes', clave: 'restaurantes', color: '#ff8a3d', importe: '-1158.28', inicio: '1508.00', fin: '349.72' },
    { tipo: 'categoria', nombre: 'Ocio', clave: 'ocio', color: '#9b6bff', importe: '-40.00', inicio: '349.72', fin: '309.72' },
    { tipo: 'categoria', nombre: 'Otros gastos', clave: 'otros_gastos', color: null, importe: '30.00', inicio: '309.72', fin: '339.72' },
    { tipo: 'balance', nombre: null, clave: null, color: null, importe: '339.72', inicio: '0.00', fin: '339.72' },
  ],
  categorias_mes_anterior: [],
  metodos: [],
  variacion: {
    patrimonio_inicial: '2000.00',
    patrimonio_final: '2367.16',
    balance: '339.72',
    revalorizacion: '27.44',
    ajustes: '0.00',
    saldos_iniciales: '0.00',
    variacion: '367.16',
  },
  objetivos: [],
};

const CONTENIDO = {
  version: 2,
  resumen: 'Septiembre cerró con un balance positivo. <script>alert(1)</script>',
  observaciones: ['El 40 % del ocio fue en fin de semana.'],
  recomendaciones: [
    {
      texto: 'Fija un límite en Restaurantes.',
      accion: { tipo: 'crear_limite', categoria: 'Restaurantes', clave: 'restaurantes', etiqueta: 'Restaurantes', importe: '300.00' },
    },
    { texto: 'Revisa tus suscripciones.', accion: null },
  ],
};

/** Contenido guardado antes de 20261024000002 (versión 1). */
const CONTENIDO_V1 = {
  resumen: 'Agosto fue tranquilo.',
  destacados: ['Restaurantes es tu primera categoría.'],
  recomendaciones: ['Revisa tus suscripciones.'],
};

const CATEGORIAS = [
  { id: 'k1', nombre: 'Restaurantes', clave: 'restaurantes', tipo: 'gasto', archivada: false, color: null, icono: null, orden: 1 },
  { id: 'k2', nombre: 'Ocio', clave: 'ocio', tipo: 'gasto', archivada: false, color: null, icono: null, orden: 2 },
];

const FILA = {
  id: 'a1',
  mes: '2026-09-01',
  estado: 'listo',
  mes_incompleto: false,
  regeneraciones: 0,
  intentos: 0,
  generado_at: '2026-10-01T05:00:00Z',
  updated_at: '2026-10-01T05:00:00Z',
};

const http = (status: number, codigo: string) => ({
  data: null,
  error: {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ error: codigo }), { status }),
  },
});

function servir({
  filas = [FILA],
  detalle = { ...FILA, datos: DATOS, contenido: CONTENIDO } as unknown,
  objetivos = [] as unknown[],
} = {}) {
  estado.responder = (ll: Llamada): Respuesta => {
    if (ll.nombre === 'perfiles') return { data: PERFIL, error: null };
    if (ll.nombre === 'cuentas') {
      return { data: [{ id: 'c1', nombre: 'BBVA', fecha_inicial: '2026-08-01', saldo_inicial: '1000.00' }], error: null };
    }
    if (ll.nombre === 'v_saldos') return { data: [], error: null };
    if (ll.nombre === 'categorias') return { data: CATEGORIAS, error: null };
    if (ll.nombre === 'objetivos') {
      return { data: ll.cadena.some(([m]) => m === 'insert') ? null : objetivos, error: null };
    }
    if (ll.nombre === 'analisis_mensuales') {
      const esDetalle = ll.cadena.some(([m]) => m === 'maybeSingle');
      return { data: esDetalle ? detalle : filas, error: null };
    }
    return { data: [], error: null };
  };
}

function montarDetalle(mes = '2026-09') {
  return renderConApp(
    <Routes>
      <Route path="/analisis/:mes" element={<PaginaAnalisisMes />} />
    </Routes>,
    { sesion: sesionFalsa(), ruta: `/analisis/${mes}` },
  );
}

beforeEach(() => {
  reiniciar();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Entrada a Análisis', () => {
  it('«Análisis» abre directamente el último mes cerrado', async () => {
    servir();
    renderConApp(
      <Routes>
        <Route path="/analisis" element={<PaginaAnalisis />} />
        <Route path="/analisis/:mes" element={<PaginaAnalisisMes />} />
      </Routes>,
      { sesion: sesionFalsa(), ruta: '/analisis' },
    );
    expect(await screen.findByRole('region', { name: 'Cifras del mes' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Septiembre de 2026' })).toHaveAttribute('aria-current', 'page');
  });

  it('chips de meses cerrados del más reciente al más antiguo; el mes en curso, como texto', async () => {
    servir();
    montarDetalle();
    const nav = await screen.findByRole('navigation', { name: 'Meses' });
    const enlaces = within(nav).getAllByRole('link');
    expect(enlaces.map((a) => a.textContent)).toEqual(['Septiembre de 2026', 'Agosto de 2026']);
    expect(enlaces[0]).toHaveAttribute('href', '/analisis/2026-09');
    expect(enlaces[0]).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByText('Octubre de 2026 · se genera el 1/11')).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Octubre/ })).not.toBeInTheDocument();
  });

  it('la lista de meses nunca pide datos ni contenido', async () => {
    servir();
    montarDetalle();
    await screen.findByRole('navigation', { name: 'Meses' });
    const lista = estado.llamadas.filter(
      (l) => l.nombre === 'analisis_mensuales' && !l.cadena.some(([m]) => m === 'maybeSingle'),
    );
    expect(lista.length).toBeGreaterThan(0);
    for (const ll of lista) {
      expect(columnas(ll)).toBe('id, mes, estado, mes_incompleto, regeneraciones, intentos, generado_at, updated_at');
    }
  });
});

describe('Detalle del análisis', () => {
  it('tres tarjetas separadas, cascada, donut, texto de la IA como texto plano y nota', async () => {
    servir();
    montarDetalle();
    const cifras = await screen.findByRole('region', { name: 'Cifras del mes' });
    expect(within(cifras).getByText('+339,72 €')).toBeInTheDocument();
    expect(within(cifras).getByText('1.508,00 € ingresos − 1.168,28 € gastos netos')).toBeInTheDocument();
    expect(within(cifras).getByText('22,5 %')).toBeInTheDocument();
    expect(within(cifras).getByText('+367,16 €')).toBeInTheDocument();
    expect(within(cifras).getByText('Balance 339,72 € + revalorización 27,44 € + ajustes 0,00 €')).toBeInTheDocument();

    // Donut de Inicio: la categoría negativa no entra en el gráfico (2 arcos), pero se lista.
    expect(screen.getAllByTestId('arco-donut')).toHaveLength(2);
    expect(screen.getAllByText('Otros gastos').length).toBeGreaterThan(1);

    // Cascada: Ingresos → categorías → Balance, con los importes de SQL.
    const tabla = screen.getByRole('table', { name: 'De tus ingresos a tu balance' });
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas.map((f) => within(f).getByRole('rowheader').textContent)).toEqual([
      'Ingresos',
      'Restaurantes',
      'Ocio',
      'Otros gastos',
      'Balance',
    ]);
    expect(filas[1]).toHaveTextContent('-1.158,28 €');
    expect(filas[1]).toHaveTextContent('349,72 €');
    expect(filas[4]).toHaveTextContent('+339,72 €');
    expect(screen.getAllByTestId('barra-cascada')).toHaveLength(5);

    // Texto de la IA, sin interpretar HTML.
    expect(screen.getByText(/Septiembre cerró con un balance positivo\. <script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.queryByText('Lo más destacado')).not.toBeInTheDocument();
    expect(screen.getByText('Lo que no se ve a simple vista')).toBeInTheDocument();
    expect(screen.getByText('El 40 % del ocio fue en fin de semana.')).toBeInTheDocument();
    expect(screen.getByText('Revisa tus suscripciones.')).toBeInTheDocument();
    expect(
      screen.getByText('Texto generado por IA a partir de tus totales. Las cifras salen de tu base.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Generado el 1 oct 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('mes sin ingresos: ahorro «—»', async () => {
    const datos = { ...DATOS, resumen: { ...RESUMEN, ingresos: '0.00', balance: '-1168.28', ahorro_pct: null } };
    servir({ detalle: { ...FILA, datos, contenido: CONTENIDO } });
    montarDetalle();
    const cifras = await screen.findByRole('region', { name: 'Cifras del mes' });
    expect(within(cifras).getByText('—')).toBeInTheDocument();
    expect(within(cifras).getByText('-1.168,28 €')).toHaveClass('text-negativo');
  });

  it('aviso de mes incompleto', async () => {
    servir({ detalle: { ...FILA, mes_incompleto: true, datos: { ...DATOS, mes_incompleto: true }, contenido: CONTENIDO } });
    montarDetalle();
    expect(await screen.findByRole('note')).toHaveTextContent('Mes incompleto');
  });

  it('contenido inválido → error genérico, sin romper', async () => {
    servir({ detalle: { ...FILA, datos: DATOS, contenido: { resumen: 42, destacados: 'x' } } });
    montarDetalle();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido mostrar este análisis.');
    expect(screen.queryByText('Lo más destacado')).not.toBeInTheDocument();
  });

  it('datos con importes como números → error genérico', async () => {
    servir({ detalle: { ...FILA, datos: { ...DATOS, resumen: { ...RESUMEN, balance: 339.72 } }, contenido: CONTENIDO } });
    montarDetalle();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido mostrar este análisis.');
  });

  it('Regenerar: llama a la Edge Function con el mes y traduce el 429', async () => {
    servir();
    estado.invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'limite_regeneracion' }), { status: 429 }),
      },
    });
    montarDetalle();
    const boton = await screen.findByRole('button', { name: 'Regenerar (1 disponible)' });
    expect(boton).toBeEnabled();
    await userEvent.click(boton);
    expect(estado.invoke).toHaveBeenCalledWith('analisis-mensual', { body: { mes: '2026-09-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya regeneraste este análisis. Solo se puede una vez.');
    expect(screen.queryByText(/non-2xx/)).not.toBeInTheDocument();
  });

  it('error de red al regenerar → mensaje amable', async () => {
    servir();
    estado.invoke.mockRejectedValue(new TypeError('Failed to fetch'));
    montarDetalle();
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerar (1 disponible)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión.');
  });

  it('ya regenerado: botón desactivado y «Ya regeneraste este análisis»', async () => {
    servir({ detalle: { ...FILA, regeneraciones: 1, datos: DATOS, contenido: CONTENIDO } });
    montarDetalle();
    expect(await screen.findByRole('button', { name: 'Regenerar (0 disponibles)' })).toBeDisabled();
    expect(screen.getByText('Ya regeneraste este análisis.')).toBeInTheDocument();
  });

  it('estado error con intentos < 3 → «Reintentar» (no consume) y no «Regenerar»', async () => {
    servir({ detalle: { ...FILA, estado: 'error', intentos: 1, datos: null, contenido: null } });
    estado.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    montarDetalle();
    expect(await screen.findByText('No se pudo generar este análisis.')).toBeInTheDocument();
    expect(screen.getByText('No gasta tu regeneración.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Regenerar/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(estado.invoke).toHaveBeenCalledWith('analisis-mensual', { body: { mes: '2026-09-01' } });
  });

  it('estado error sin reintentos (3 intentos): sin botón', async () => {
    servir({ detalle: { ...FILA, estado: 'error', intentos: 3, datos: null, contenido: null } });
    montarDetalle();
    expect(await screen.findByText(/tras varios intentos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reintentar|Regenerar/ })).not.toBeInTheDocument();
  });

  it('429 limite_reintentos → mensaje amable', async () => {
    servir({ detalle: { ...FILA, estado: 'error', intentos: 2, datos: null, contenido: null } });
    estado.invoke.mockResolvedValue(http(429, 'limite_reintentos'));
    montarDetalle();
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya no quedan reintentos para este análisis.');
    expect(screen.queryByText(/non-2xx/)).not.toBeInTheDocument();
  });

  it('generando atascado (> 15 min sin cambios) → «Reintentar»; 409 en_curso → mensaje amable', async () => {
    servir({ detalle: { ...FILA, estado: 'generando', updated_at: '2026-10-19T09:40:00Z', datos: null, contenido: null } });
    estado.invoke.mockResolvedValue(http(409, 'en_curso'));
    montarDetalle();
    expect(await screen.findByText('La generación se ha quedado parada. Puedes volver a intentarlo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu análisis ya se está generando.');
  });

  it('generando reciente (< 15 min) → espera, sin botón', async () => {
    servir({ detalle: { ...FILA, estado: 'pendiente', updated_at: '2026-10-19T09:50:00Z', datos: null, contenido: null } });
    montarDetalle();
    expect(await screen.findByText('Generando tu análisis… Puede tardar un minuto.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('contenido de la versión 1 (con «destacados») se sigue mostrando, sin «Lo más destacado»', async () => {
    servir({ detalle: { ...FILA, datos: DATOS, contenido: CONTENIDO_V1 } });
    montarDetalle();
    expect(await screen.findByText('Agosto fue tranquilo.')).toBeInTheDocument();
    expect(screen.getByText('Revisa tus suscripciones.')).toBeInTheDocument();
    expect(screen.queryByText('Restaurantes es tu primera categoría.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Crear límite/ })).not.toBeInTheDocument();
  });

  it('snapshot sin cascada: el gráfico dice que no hay datos, sin romper', async () => {
    const sinCascada: Record<string, unknown> = { ...DATOS };
    delete sinCascada.cascada;
    servir({ detalle: { ...FILA, datos: sinCascada, contenido: CONTENIDO } });
    montarDetalle();
    expect(await screen.findByText('No hay datos para este gráfico.')).toBeInTheDocument();
  });

  it('cuentas nuevas en el mes: su saldo inicial es patrimonio de partida, no ganancia', async () => {
    const variacion = {
      patrimonio_inicial: '1013.42',
      patrimonio_final: '1353.14',
      balance: '339.72',
      revalorizacion: '0.00',
      ajustes: '0.00',
      saldos_iniciales: '1013.42',
      variacion: '339.72',
      base: 'partida',
    };
    servir({ detalle: { ...FILA, datos: { ...DATOS, variacion }, contenido: CONTENIDO } });
    montarDetalle();
    const cifras = await screen.findByRole('region', { name: 'Cifras del mes' });
    expect(within(cifras).getByText(/Patrimonio de partida con 1\.013,42 € de saldos iniciales/)).toBeInTheDocument();
    expect(within(cifras).queryByText('+1.353,14 €')).not.toBeInTheDocument();
  });

  it('recomendación con acción: «Crear límite» abre la hoja prellenada y crea el objetivo', async () => {
    servir();
    montarDetalle();
    await userEvent.click(await screen.findByRole('button', { name: /^Crear límite: Restaurantes · 300,00\s€\/mes$/ }));
    const hoja = await screen.findByRole('dialog', { name: 'Límite para Restaurantes' });
    const campo = await within(hoja).findByLabelText('Límite al mes');
    expect(campo).toHaveValue('300,00');
    await userEvent.clear(campo);
    await userEvent.type(campo, '250,5');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Crear límite' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const insert = estado.llamadas.find((l) => l.nombre === 'objetivos' && l.cadena.some(([m]) => m === 'insert'));
    expect(insert?.cadena.find(([m]) => m === 'insert')?.[1][0]).toEqual({
      tipo: 'limite_categoria',
      categoria_id: 'k1',
      importe: '250.50',
    });
  });

  it('si la categoría ya tiene límite, no deja crear otro', async () => {
    servir({ objetivos: [{ id: 'o1', tipo: 'limite_categoria', categoria_id: 'k1', importe: '200.00' }] });
    montarDetalle();
    await userEvent.click(await screen.findByRole('button', { name: /Crear límite: Restaurantes/ }));
    const hoja = await screen.findByRole('dialog');
    expect(await within(hoja).findByText(/Esta categoría ya tiene un límite/)).toBeInTheDocument();
    expect(within(hoja).getByRole('button', { name: 'Crear límite' })).toBeDisabled();
  });

  it('pendiente: sondea la fila hasta que está lista', async () => {
    let llamadasDetalle = 0;
    estado.responder = (ll: Llamada): Respuesta => {
      if (ll.nombre === 'perfiles') return { data: PERFIL, error: null };
      if (ll.nombre === 'analisis_mensuales' && ll.cadena.some(([m]) => m === 'maybeSingle')) {
        llamadasDetalle++;
        return {
          data: llamadasDetalle < 2 ? { ...FILA, estado: 'generando', updated_at: '2026-10-19T09:59:00Z' } : { ...FILA, datos: DATOS, contenido: CONTENIDO },
          error: null,
        };
      }
      return { data: [], error: null };
    };
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
    montarDetalle();
    expect(await screen.findByText('Generando tu análisis… Puede tardar un minuto.')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(5_100);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Cifras del mes' })).toBeInTheDocument());
  });

  it('mes en curso sin fila: se genera el día 1 del mes siguiente', async () => {
    servir({ detalle: null });
    montarDetalle('2026-10');
    expect(await screen.findByText('El análisis de este mes se genera el 1/11.')).toBeInTheDocument();
  });

  it('mes cerrado sin fila: «Generar análisis»', async () => {
    servir({ detalle: null });
    montarDetalle('2026-08');
    expect(await screen.findByRole('button', { name: 'Generar análisis' })).toBeInTheDocument();
  });
});
