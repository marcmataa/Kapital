import { Route, Routes } from 'react-router';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import PaginaAnalisis from './pages/PaginaAnalisis';
import PaginaAnalisisMes from './pages/PaginaAnalisisMes';
import { columnas, estado, PERFIL, reiniciar, type Llamada, type Respuesta } from './test/supabaseFalso';

vi.mock('@/shared/lib/supabase', async () => (await import('./test/supabaseFalso')).moduloFalso);

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
  resumen: 'Septiembre cerró con un balance positivo. <script>alert(1)</script>',
  destacados: ['Restaurantes es tu primera categoría.', 'Los gastos netos bajaron.'],
  recomendaciones: ['Fija un límite en Restaurantes.', 'Revisa tus suscripciones.'],
};

const FILA = {
  id: 'a1',
  mes: '2026-09-01',
  estado: 'listo',
  mes_incompleto: false,
  regeneraciones: 0,
  generado_at: '2026-10-01T05:00:00Z',
};

function servir({ filas = [FILA], detalle = { ...FILA, datos: DATOS, contenido: CONTENIDO } as unknown } = {}) {
  estado.responder = (ll: Llamada): Respuesta => {
    if (ll.nombre === 'perfiles') return { data: PERFIL, error: null };
    if (ll.nombre === 'cuentas') {
      return { data: [{ id: 'c1', nombre: 'BBVA', fecha_inicial: '2026-08-01', saldo_inicial: '1000.00' }], error: null };
    }
    if (ll.nombre === 'v_saldos') return { data: [], error: null };
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

describe('Lista de análisis', () => {
  it('nunca pide datos ni contenido en la lista', async () => {
    servir();
    renderConApp(<PaginaAnalisis />, { sesion: sesionFalsa(), ruta: '/analisis' });
    await screen.findByRole('link', { name: /Septiembre de 2026/ });
    const consultas = estado.llamadas.filter((l) => l.nombre === 'analisis_mensuales');
    expect(consultas).toHaveLength(1);
    expect(columnas(consultas[0] as Llamada)).toBe('id, mes, estado, mes_incompleto, regeneraciones, generado_at');
    expect(columnas(consultas[0] as Llamada)).not.toMatch(/datos|contenido/);
  });

  it('mes en curso «se genera el 1/11», meses con análisis y meses cerrados sin fila → «Generar análisis»', async () => {
    servir();
    estado.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    renderConApp(<PaginaAnalisis />, { sesion: sesionFalsa(), ruta: '/analisis' });
    expect(await screen.findByText('Se genera el 1/11')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Septiembre de 2026/ })).toHaveAttribute('href', '/analisis/2026-09');
    // Agosto (primer mes con datos) no tiene fila: primera generación.
    const agosto = screen.getByText('Agosto de 2026').closest('li') as HTMLElement;
    await userEvent.click(within(agosto).getByRole('button', { name: 'Generar análisis' }));
    expect(estado.invoke).toHaveBeenCalledWith('analisis-mensual', { body: { mes: '2026-08-01' } });
    expect(screen.queryByText('Julio de 2026')).not.toBeInTheDocument();
  });
});

describe('Detalle del análisis', () => {
  it('tres tarjetas separadas, donut, texto de la IA como texto plano y nota', async () => {
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
    expect(screen.getByText('Otros gastos')).toBeInTheDocument();

    // Barras accesibles: mes anterior y este mes.
    const tabla = screen.getByRole('table', { name: 'Ingresos y gastos netos' });
    expect(within(tabla).getByRole('row', { name: /Agosto/ })).toHaveTextContent('1.420,00 €');

    // Texto de la IA, sin interpretar HTML.
    expect(screen.getByText(/Septiembre cerró con un balance positivo\. <script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Lo más destacado')).toBeInTheDocument();
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

  it('estado error → se reintentará automáticamente', async () => {
    servir({ detalle: { ...FILA, estado: 'error', datos: null, contenido: null } });
    montarDetalle();
    expect(await screen.findByText('No se pudo generar; se reintentará automáticamente.')).toBeInTheDocument();
  });

  it('pendiente: sondea la fila hasta que está lista', async () => {
    let llamadasDetalle = 0;
    estado.responder = (ll: Llamada): Respuesta => {
      if (ll.nombre === 'perfiles') return { data: PERFIL, error: null };
      if (ll.nombre === 'analisis_mensuales' && ll.cadena.some(([m]) => m === 'maybeSingle')) {
        llamadasDetalle++;
        return {
          data: llamadasDetalle < 2 ? { ...FILA, estado: 'generando' } : { ...FILA, datos: DATOS, contenido: CONTENIDO },
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
