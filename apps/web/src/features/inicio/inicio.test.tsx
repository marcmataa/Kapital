import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';

/*
 * Supabase simulado: registra cada consulta (tabla o RPC, columnas pedidas, argumentos) y
 * responde con los datos del escenario. Así se comprueba que los importes se piden con ::text.
 */
interface Llamada {
  origen: string;
  args?: Record<string, unknown>;
  select?: string;
  insert?: Record<string, unknown>;
}
type Respuesta = { data: unknown; error: unknown };

const sb = vi.hoisted(() => ({
  llamadas: [] as Llamada[],
  responder: (_l: Llamada): Respuesta => ({ data: null, error: null }),
}));

vi.mock('@/shared/lib/supabase', () => {
  const consulta = (llamada: Llamada) => {
    sb.llamadas.push(llamada);
    const q = {
      select: (columnas: string) => {
        llamada.select = columnas;
        return q;
      },
      insert: (fila: Record<string, unknown>) => {
        llamada.insert = fila;
        return q;
      },
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => q,
      then: (ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) =>
        Promise.resolve().then(() => sb.responder(llamada)).then(ok, ko),
    };
    return q;
  };
  return {
    supabase: {
      from: (tabla: string) => consulta({ origen: tabla }),
      rpc: (fn: string, args: Record<string, unknown>) => consulta({ origen: `rpc:${fn}`, args }),
    },
  };
});

const { default: PaginaInicio } = await import('./pages/PaginaInicio');
const { FormObjetivo } = await import('./components/FormObjetivo');

const ok = (data: unknown): Respuesta => ({ data, error: null });

const PERFIL = { user_id: 'u1', idioma: 'es', zona_horaria: 'Europe/Madrid', onboarding_completado: true };
const CATEGORIAS = [
  { id: 'ocio', nombre: 'Ocio', tipo: 'gasto', color: '#9b6bff', icono: null, orden: 1, archivada: false },
  { id: 'trans', nombre: 'Transporte', tipo: 'gasto', color: '#3b82ff', icono: null, orden: 2, archivada: false },
  { id: 'nomina', nombre: 'Nómina', tipo: 'ingreso', color: '#5fd3a0', icono: null, orden: 3, archivada: false },
];

interface Escenario {
  analisis?: unknown;
  objetivos?: unknown[];
  movimientos?: unknown[];
  insertError?: unknown;
  /** fecha_inicial de la cuenta más antigua (primer día con datos). */
  inicioDatos?: string;
}

function escenario({
  analisis = null,
  objetivos = [],
  movimientos = [],
  insertError = null,
  inicioDatos = '2026-01-01',
}: Escenario = {}) {
  sb.responder = (l) => {
    switch (l.origen) {
      case 'cuentas':
        return ok([{ id: 'c1', nombre: 'BBVA', tipo: 'banco', fecha_inicial: inicioDatos, saldo_inicial: '1000.00' }]);
      case 'v_saldos':
        return ok([]);
      case 'perfiles':
        return ok(PERFIL);
      case 'categorias':
        return ok(CATEGORIAS);
      case 'objetivos':
        return l.insert ? { data: null, error: insertError } : ok(objetivos);
      case 'movimientos':
        return ok(movimientos);
      case 'analisis_mensuales':
        return ok(analisis);
      case 'rpc:resumen_periodo':
        // Meses completos (selector de mes): septiembre (sección 3) y agosto.
        if (l.args?.p_desde === '2026-09-01' && l.args.p_hasta === '2026-09-30') {
          return ok([{ ingresos: '1508.00', gastos_netos: '1168.28', balance: '339.72' }]);
        }
        if (l.args?.p_desde === '2026-08-01' && l.args.p_hasta === '2026-08-31') {
          return ok([{ ingresos: '1400.00', gastos_netos: '1000.00', balance: '400.00' }]);
        }
        return l.args?.p_desde === '2026-10-01'
          ? ok([{ ingresos: '3420.00', gastos_netos: '961.68', balance: '342.00' }])
          : ok([{ ingresos: '0.00', gastos_netos: '900.00', balance: '-900.00' }]);
      case 'rpc:serie_patrimonio': {
        const mes = String(l.args?.p_desde).slice(0, 7);
        const dias = mes === '2026-10' ? 19 : 30;
        return ok(
          Array.from({ length: dias }, (_, i) => {
            const fecha = `${mes}-${String(i + 1).padStart(2, '0')}`;
            return { fecha, patrimonio: `${2000 + i}.00`, provisional: fecha === '2026-10-19' };
          }),
        );
      }
      case 'rpc:gasto_por_categoria':
        return ok([
          { categoria_id: 'ocio', nombre: 'Ocio', color: '#9b6bff', gasto: '215.00' },
          { categoria_id: 'trans', nombre: 'Transporte', color: '#3b82ff', gasto: '746.68' },
        ]);
      default:
        return ok([]);
    }
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
  sb.llamadas = [];
  escenario();
});

afterEach(() => {
  vi.useRealTimers();
});

const pintar = () => renderConApp(<PaginaInicio />, { sesion: sesionFalsa('u1') });

describe('PaginaInicio · datos', () => {
  it('pide todos los importes como texto (::text), también en las RPC de tabla', async () => {
    pintar();
    await screen.findByText('Patrimonio a 19/10/2026');
    await waitFor(() => expect(sb.llamadas.some((l) => l.origen === 'movimientos')).toBe(true));

    const de = (origen: string) => sb.llamadas.filter((l) => l.origen === origen);
    for (const l of de('rpc:resumen_periodo')) expect(l.select).toBe('ingresos::text, gastos_netos::text, balance::text');
    for (const l of de('rpc:serie_patrimonio')) expect(l.select).toBe('fecha, patrimonio::text, provisional');
    for (const l of de('rpc:gasto_por_categoria')) expect(l.select).toBe('categoria_id, nombre, color, gasto::text');
    expect(de('movimientos')[0]?.select).toContain('importe::text');
    expect(de('objetivos')[0]?.select).toContain('importe::text');
    expect(de('analisis_mensuales')[0]?.select).toBe('mes, contenido');
    // Nunca la función escalar patrimonio() (devolvería un número JSON).
    expect(sb.llamadas.some((l) => l.origen === 'rpc:patrimonio')).toBe(false);
  });

  it('usa los periodos de la sección 7: 1..hoy vs 1..d′ y series con p_hoy', async () => {
    pintar();
    await screen.findByText('Patrimonio a 19/10/2026');
    const args = sb.llamadas.filter((l) => l.origen.startsWith('rpc:')).map((l) => [l.origen, l.args]);
    expect(args).toContainEqual(['rpc:resumen_periodo', { p_desde: '2026-10-01', p_hasta: '2026-10-19' }]);
    expect(args).toContainEqual(['rpc:resumen_periodo', { p_desde: '2026-09-01', p_hasta: '2026-09-19' }]);
    expect(args).toContainEqual([
      'rpc:serie_patrimonio',
      { p_desde: '2026-10-01', p_hasta: '2026-10-31', p_hoy: '2026-10-19' },
    ]);
    expect(args).toContainEqual([
      'rpc:serie_patrimonio',
      { p_desde: '2026-09-01', p_hasta: '2026-09-30', p_hoy: '2026-10-19' },
    ]);
    expect(args).toContainEqual(['rpc:gasto_por_categoria', { p_desde: '2026-10-01', p_hasta: '2026-10-19' }]);
  });

  it('las tarjetas muestran patrimonio a hoy y «Sin datos del mes anterior» si los ingresos previos son 0', async () => {
    pintar();
    const titulo = await screen.findByRole('heading', { name: 'Patrimonio a 19/10/2026' });
    const tarjeta = titulo.closest('article');
    if (!tarjeta) throw new Error('sin tarjeta');
    // Hoy = 2.018,00 €; 19 sept = 2.018,00 € → +0,0 %.
    expect(within(tarjeta).getByText(/2\.018,00/)).toBeInTheDocument();
    const ingresos = screen.getByRole('heading', { name: 'Ingresos · 1–19 oct' }).closest('article');
    if (!ingresos) throw new Error('sin tarjeta');
    expect(within(ingresos).getByText('Sin datos del mes anterior')).toBeInTheDocument();
  });
});

describe('PaginaInicio · periodo anterior parcial (sección 8)', () => {
  it('datos desde el 25/09: el 27/10 no hay % de ingresos ni de gastos (1–27 sept está incompleto)', async () => {
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    escenario({ inicioDatos: '2026-09-25' });
    pintar();
    const gastos = (await screen.findByRole('heading', { name: 'Gastos netos · 1–27 oct' })).closest('article');
    const ingresos = screen.getByRole('heading', { name: 'Ingresos · 1–27 oct' }).closest('article');
    if (!gastos || !ingresos) throw new Error('sin tarjeta');
    expect(within(gastos).getByText('Sin datos del mes anterior')).toBeInTheDocument();
    expect(within(ingresos).getByText('Sin datos del mes anterior')).toBeInTheDocument();
    expect(within(gastos).queryByText(/%/)).not.toBeInTheDocument();
    // Ni siquiera se pide el resumen de 1–27 sept.
    expect(sb.llamadas).not.toContainEqual(
      expect.objectContaining({ origen: 'rpc:resumen_periodo', args: { p_desde: '2026-09-01', p_hasta: '2026-09-27' } }),
    );
  });

  it('datos desde el día 1 del mes anterior: sí hay % de gastos', async () => {
    escenario({ inicioDatos: '2026-09-01' });
    pintar();
    const gastos = (await screen.findByRole('heading', { name: 'Gastos netos · 1–19 oct' })).closest('article');
    if (!gastos) throw new Error('sin tarjeta');
    // 900,00 → 961,68: +6,9 %.
    expect(await within(gastos).findByText('+6,9 %')).toBeInTheDocument();
  });
});

describe('PaginaInicio · saludo', () => {
  it('sin nombre en user_metadata saluda solo con «Hola»', async () => {
    pintar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola' })).toBeInTheDocument();
  });

  it('con Google saluda con el nombre de pila y la pestaña sigue en «Hola · Kapital»', async () => {
    renderConApp(<PaginaInicio />, {
      sesion: sesionFalsa('u1', { user_metadata: { given_name: 'Lucía', full_name: 'Lucía Prueba Gómez' } }),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Lucía' })).toBeInTheDocument();
    expect(document.title).toBe('Hola · Kapital');
  });

  it('sin given_name usa la primera palabra de full_name, también en inglés', async () => {
    renderConApp(<PaginaInicio />, {
      sesion: sesionFalsa('u1', { user_metadata: { full_name: 'Pau Ejemplo Ruiz' } }),
      idioma: 'en',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Pau' })).toBeInTheDocument();
  });
});

describe('PaginaInicio · análisis bajo el donut', () => {
  it('sin análisis listo muestra el aviso del primer análisis', async () => {
    pintar();
    expect(await screen.findByText('Tu primer análisis con IA llegará el día 1 del mes que viene.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver el análisis completo →' })).not.toBeInTheDocument();
  });

  it('con análisis listo muestra 2 destacados como texto y enlaza a /analisis/YYYY-MM', async () => {
    escenario({
      analisis: {
        mes: '2026-09-01',
        contenido: {
          resumen: 'Buen mes.',
          destacados: ['Restaurantes fue tu primera categoría.', '<b>Ahorraste</b> un 22,5 %.', 'Tercero.'],
          recomendaciones: ['Uno.', 'Dos.'],
        },
      },
    });
    pintar();
    expect(await screen.findByText('De tu análisis de septiembre')).toBeInTheDocument();
    expect(screen.getByText('Restaurantes fue tu primera categoría.')).toBeInTheDocument();
    // Texto plano: el HTML no se interpreta.
    expect(screen.getByText('<b>Ahorraste</b> un 22,5 %.')).toBeInTheDocument();
    expect(screen.queryByText('Tercero.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el análisis completo →' })).toHaveAttribute('href', '/analisis/2026-09');
  });

  it('si el contenido no tiene la forma esperada (zod), se trata como sin análisis', async () => {
    escenario({ analisis: { mes: '2026-09-01', contenido: { resumen: 1 } } });
    pintar();
    expect(await screen.findByText('Tu primer análisis con IA llegará el día 1 del mes que viene.')).toBeInTheDocument();
  });
});

/** Muestra la query string actual para comprobar que el mes se refleja en la URL. */
function Ubicacion() {
  const { search } = useLocation();
  return <output data-testid="ubicacion">{search}</output>;
}

const pintarEn = (ruta: string) =>
  renderConApp(
    <>
      <PaginaInicio />
      <Ubicacion />
    </>,
    { sesion: sesionFalsa('u1'), ruta },
  );

const argsRpc = () => sb.llamadas.filter((l) => l.origen.startsWith('rpc:')).map((l) => [l.origen, l.args]);

describe('PaginaInicio · selector de mes', () => {
  it('sin ?mes muestra el mes en curso; «siguiente» desactivado (no hay futuro)', async () => {
    pintar();
    await screen.findByText('Patrimonio a 19/10/2026');
    expect(screen.getByRole('combobox', { name: 'Mes' })).toHaveDisplayValue('Octubre de 2026 · hasta hoy');
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeEnabled();
    // Rango: de enero (primera cuenta) a octubre.
    const opciones = within(screen.getByRole('combobox', { name: 'Mes' })).getAllByRole('option');
    expect(opciones).toHaveLength(10);
    expect(opciones.at(-1)).toHaveTextContent('Enero de 2026');
  });

  it('«Mes anterior» pone ?mes=2026-09 y pide mes completo vs mes anterior completo', async () => {
    pintarEn('/');
    await screen.findByText('Patrimonio a 19/10/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(await screen.findByText('Patrimonio a 30/09/2026')).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('?mes=2026-09');
    const args = argsRpc();
    expect(args).toContainEqual(['rpc:resumen_periodo', { p_desde: '2026-09-01', p_hasta: '2026-09-30' }]);
    expect(args).toContainEqual(['rpc:resumen_periodo', { p_desde: '2026-08-01', p_hasta: '2026-08-31' }]);
    expect(args).toContainEqual([
      'rpc:serie_patrimonio',
      { p_desde: '2026-09-01', p_hasta: '2026-09-30', p_hoy: '2026-10-19' },
    ]);
    expect(args).toContainEqual([
      'rpc:serie_patrimonio',
      { p_desde: '2026-08-01', p_hasta: '2026-08-31', p_hoy: '2026-10-19' },
    ]);
    expect(args).toContainEqual(['rpc:gasto_por_categoria', { p_desde: '2026-09-01', p_hasta: '2026-09-30' }]);
    // Volver al mes en curso quita el parámetro.
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(await screen.findByText('Patrimonio a 19/10/2026')).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toBeEmptyDOMElement();
  });

  it('mes cerrado: etiquetas del mes completo, sin «provisional» ni «hoy»', async () => {
    pintarEn('/?mes=2026-09');
    const patrimonio = (await screen.findByRole('heading', { name: 'Patrimonio a 30/09/2026' })).closest('article');
    if (!patrimonio) throw new Error('sin tarjeta');
    // 30 sept = 2.029,00 €; d′ = 30 ago (sección 7) = 2.029,00 €.
    expect(within(patrimonio).getByText(/2\.029,00/)).toBeInTheDocument();
    expect(within(patrimonio).getByText('vs 30/08/2026')).toBeInTheDocument();
    const ingresos = screen.getByRole('heading', { name: 'Ingresos · 1–30 sept' }).closest('article');
    const gastos = screen.getByRole('heading', { name: 'Gastos netos · 1–30 sept' }).closest('article');
    if (!ingresos || !gastos) throw new Error('sin tarjeta');
    // 1.400,00 → 1.508,00: +7,7 %; 1.000,00 → 1.168,28: +16,8 %, contra agosto completo.
    expect(within(ingresos).getByText('+7,7 %')).toBeInTheDocument();
    expect(within(gastos).getByText('+16,8 %')).toBeInTheDocument();
    expect(within(ingresos).getByText('vs 1–31 ago')).toBeInTheDocument();

    expect(screen.getByRole('combobox', { name: 'Mes' })).toHaveDisplayValue('Septiembre de 2026');
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled();
    expect(await screen.findByTestId('punto-cierre')).toBeInTheDocument();
    expect(screen.queryByTestId('punto-hoy')).not.toBeInTheDocument();
    expect(screen.getByText('30 sept')).toBeInTheDocument();
    expect(screen.queryByText(/provisional/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(hoy\)/)).not.toBeInTheDocument();
  });

  it.each([
    ['inválido', '/?mes=2026-13'],
    ['sin formato', '/?mes=septiembre'],
    ['futuro', '/?mes=2026-11'],
    ['antes de la primera cuenta', '/?mes=2025-12'],
  ])('un ?mes %s cae al mes en curso', async (_caso, ruta) => {
    pintarEn(ruta);
    expect(await screen.findByText('Patrimonio a 19/10/2026')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Mes' })).toHaveDisplayValue('Octubre de 2026 · hasta hoy');
    // Nunca se piden datos del mes pedido.
    expect(sb.llamadas.some((l) => String(l.args?.p_desde ?? '').startsWith(ruta.slice(-7)))).toBe(false);
  });

  it('en el mes de la primera cuenta «anterior» está desactivado y no hay comparación', async () => {
    escenario({ inicioDatos: '2026-01-01' });
    pintarEn('/?mes=2026-01');
    const ingresos = (await screen.findByRole('heading', { name: 'Ingresos · 1–31 ene' })).closest('article');
    if (!ingresos) throw new Error('sin tarjeta');
    expect(within(ingresos).getByText('Sin datos del mes anterior')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    // Diciembre de 2025 es anterior a los datos: ni se pide su resumen.
    expect(argsRpc()).not.toContainEqual(['rpc:resumen_periodo', { p_desde: '2025-12-01', p_hasta: '2025-12-31' }]);
  });

  it('mes cerrado con análisis listo: destacados de ESE mes', async () => {
    escenario({
      analisis: {
        mes: '2026-09-01',
        contenido: { resumen: 'Bien.', destacados: ['Uno.', 'Dos.'], recomendaciones: ['A.', 'B.'] },
      },
    });
    pintarEn('/?mes=2026-09');
    expect(await screen.findByText('De tu análisis de septiembre')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el análisis completo →' })).toHaveAttribute('href', '/analisis/2026-09');
  });

  it('mes cerrado sin análisis: lo dice y enlaza a su página de Análisis', async () => {
    pintarEn('/?mes=2026-08');
    expect(await screen.findByText('Todavía no hay análisis de agosto.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al análisis →' })).toHaveAttribute('href', '/analisis/2026-08');
    expect(screen.queryByText('Tu primer análisis con IA llegará el día 1 del mes que viene.')).not.toBeInTheDocument();
  });

  it('los objetivos siguen siendo del mes en curso aunque se mire un mes cerrado', async () => {
    escenario({ objetivos: [{ id: 'o1', tipo: 'ahorro_mensual', categoria_id: null, importe: '500.00' }] });
    pintarEn('/?mes=2026-09');
    expect(await screen.findByText('Objetivos · octubre')).toBeInTheDocument();
    const ahorro = await screen.findByRole('progressbar', { name: /^Ahorrar 500,00\s€ al mes$/ });
    // Balance de 1–19 oct (342,00 €), no el de septiembre.
    expect((ahorro.getAttribute('aria-valuetext') ?? '').replace(/\s+/g, ' ')).toBe('342,00 € / 500,00 €');
  });
});

describe('PaginaInicio · objetivos y movimientos', () => {
  it('ahorro mensual = balance del mes frente al objetivo; un límite superado sale en rojo', async () => {
    escenario({
      objetivos: [
        { id: 'o1', tipo: 'ahorro_mensual', categoria_id: null, importe: '500.00' },
        { id: 'o2', tipo: 'limite_categoria', categoria_id: 'ocio', importe: '200.00' },
      ],
    });
    pintar();
    expect(await screen.findByText('Objetivos · octubre')).toBeInTheDocument();
    const ahorro = await screen.findByRole('progressbar', { name: /^Ahorrar 500,00\s€ al mes$/ });
    expect(ahorro).toHaveAttribute('aria-valuenow', '68');
    expect((ahorro.getAttribute('aria-valuetext') ?? '').replace(/\s+/g, ' ')).toBe('342,00 € / 500,00 €');

    const limite = screen.getByRole('progressbar', { name: /^Ocio por debajo de 200,00\s€$/ });
    expect(limite).toHaveAttribute('aria-valuenow', '100');
    expect(limite.firstElementChild).toHaveClass('bg-negativo');
    expect(screen.getByText('Superado')).toHaveClass('text-negativo');
  });

  it('últimos movimientos: signo por tipo y traspaso neutro', async () => {
    escenario({
      movimientos: [
        {
          id: 'm1', fecha: '2026-10-14', concepto: 'Devolución entradas', tipo: 'devolucion', importe: '24.00', sentido: null,
          categoria: { nombre: 'Ocio', color: '#9b6bff' }, cuenta: { nombre: 'BBVA' }, destino: null,
        },
        {
          id: 'm2', fecha: '2026-10-13', concepto: 'Supermercado', tipo: 'gasto', importe: '56.30', sentido: null,
          categoria: { nombre: 'Otros gastos', color: '#8f9bbd' }, cuenta: { nombre: 'BBVA' }, destino: null,
        },
        {
          id: 'm3', fecha: '2026-10-10', concepto: 'Ahorro', tipo: 'traspaso', importe: '100.00', sentido: null,
          categoria: null, cuenta: { nombre: 'CaixaBank' }, destino: { nombre: 'ING' },
        },
      ],
    });
    pintar();
    const lista = await screen.findByText('Supermercado');
    const fila = (texto: string) => {
      const a = screen.getByText(texto).closest('a');
      if (!a) throw new Error('sin fila');
      return a;
    };
    expect(lista).toBeInTheDocument();
    expect(within(fila('Devolución entradas')).getByText(/24,00/)).toHaveClass('text-positivo');
    expect(within(fila('Devolución entradas')).getByText(/24,00/)).toHaveTextContent('+24,00 €');
    expect(within(fila('Supermercado')).getByText(/56,30/)).toHaveTextContent('-56,30 €');
    expect(within(fila('Supermercado')).getByText(/56,30/)).toHaveClass('text-negativo');
    const traspaso = within(fila('Ahorro')).getByText(/100,00/);
    expect(traspaso).toHaveClass('text-apagado');
    expect(traspaso.textContent).not.toMatch(/[+-]/);
    expect(within(fila('Ahorro')).getByText('CaixaBank → ING')).toBeInTheDocument();
    expect(fila('Supermercado')).toHaveAttribute('href', '/movimientos/m2');
    expect(screen.getByRole('link', { name: 'Ver todos →' })).toHaveAttribute('href', '/movimientos');
  });

  it('usuario nuevo: estados vacíos sin errores', async () => {
    pintar();
    expect(await screen.findByText('Aún no has registrado ningún movimiento.')).toBeInTheDocument();
    expect(screen.getByText('Aún no tienes objetivos. Añade uno para seguirlo aquí.')).toBeInTheDocument();
  });
});

describe('FormObjetivo', () => {
  const pintarForm = (onHecho = vi.fn(), onCancelar = vi.fn()) => {
    renderConApp(<FormObjetivo onHecho={onHecho} onCancelar={onCancelar} />, { sesion: sesionFalsa('u1') });
    return { onHecho, onCancelar };
  };

  it('crea un ahorro mensual con el importe normalizado', async () => {
    const { onHecho } = pintarForm();
    await userEvent.type(await screen.findByLabelText('Ahorro al mes'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onHecho).toHaveBeenCalled());
    const insert = sb.llamadas.find((l) => l.origen === 'objetivos' && l.insert)?.insert;
    expect(insert).toEqual({ tipo: 'ahorro_mensual', categoria_id: null, importe: '150.00' });
  });

  it('en inglés «1,000» + Enter (sin salir del campo) guarda mil euros, no uno', async () => {
    const onHecho = vi.fn();
    renderConApp(<FormObjetivo onHecho={onHecho} onCancelar={vi.fn()} />, { sesion: sesionFalsa('u1'), idioma: 'en' });
    await userEvent.type(await screen.findByLabelText('Savings per month'), '1,000{Enter}');
    await waitFor(() => expect(onHecho).toHaveBeenCalled());
    const insert = sb.llamadas.find((l) => l.origen === 'objetivos' && l.insert)?.insert;
    expect(insert).toEqual({ tipo: 'ahorro_mensual', categoria_id: null, importe: '1000.00' });
  });

  it('23505 → aviso amable de que ya existe', async () => {
    escenario({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    const { onHecho } = pintarForm();
    await userEvent.type(await screen.findByLabelText('Ahorro al mes'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes un objetivo de ahorro activo.');
    expect(onHecho).not.toHaveBeenCalled();
  });

  it('límite de categoría: solo categorías de gasto sin límite activo, y la categoría es obligatoria', async () => {
    escenario({ objetivos: [{ id: 'o2', tipo: 'limite_categoria', categoria_id: 'ocio', importe: '200.00' }] });
    pintarForm();
    await userEvent.click(await screen.findByRole('radio', { name: 'Límite de categoría' }));
    const select = await screen.findByLabelText('Categoría');
    const opciones = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Elige una categoría', 'Transporte']);
    await userEvent.type(screen.getByLabelText('Límite al mes'), '80');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Elige una categoría.')).toBeInTheDocument();
    expect(sb.llamadas.some((l) => l.insert)).toBe(false);
  });
});
