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
  /** Filas de `cuentas` y de `v_saldos` (valor de hoy) para el desglose por cuenta. */
  cuentas?: unknown[];
  saldos?: unknown[];
  /** Respuesta de valores_cuentas por p_fecha. */
  valoresCierre?: Record<string, unknown[]>;
  /** Filas de progreso_objetivos (SQL). */
  progreso?: unknown[];
  /** Filas de peso_otros_gastos (SQL). */
  pesoOtros?: unknown[];
  /** Filas de ingresos_por_categoria (SQL). */
  ingresosCategorias?: unknown[];
  /** Filas de `categorias` (por defecto, CATEGORIAS). */
  categorias?: unknown[];
}

function escenario({
  analisis = null,
  objetivos = [],
  movimientos = [],
  insertError = null,
  inicioDatos = '2026-01-01',
  cuentas,
  saldos = [],
  valoresCierre = {},
  progreso = [],
  pesoOtros = [],
  ingresosCategorias = [],
  categorias = CATEGORIAS,
}: Escenario = {}) {
  sb.responder = (l) => {
    switch (l.origen) {
      case 'cuentas':
        return ok(
          cuentas ?? [{ id: 'c1', nombre: 'BBVA', tipo: 'banco', fecha_inicial: inicioDatos, saldo_inicial: '1000.00' }],
        );
      case 'v_saldos':
        return ok(saldos);
      case 'rpc:progreso_objetivos':
        return ok(progreso);
      case 'rpc:peso_otros_gastos':
        return ok(pesoOtros);
      case 'rpc:ingresos_por_categoria':
        return ok(ingresosCategorias);
      case 'rpc:valores_cuentas':
        return ok(valoresCierre[String(l.args?.p_fecha)] ?? []);
      case 'perfiles':
        return ok(PERFIL);
      case 'categorias':
        return ok(categorias);
      case 'objetivos':
        return l.insert ? { data: null, error: insertError } : ok(objetivos);
      case 'movimientos':
        return ok(movimientos);
      case 'analisis_mensuales':
        return ok(analisis);
      case 'rpc:resumen_periodo':
        // Meses completos (selector de mes): septiembre (sección 3) y agosto.
        if (l.args?.p_desde === '2026-09-01' && l.args.p_hasta === '2026-09-30') {
          return ok([{ ingresos: '1508.00', gastos_netos: '1168.28', balance: '339.72', ahorro_pct: '22.5278514588859416' }]);
        }
        if (l.args?.p_desde === '2026-08-01' && l.args.p_hasta === '2026-08-31') {
          return ok([{ ingresos: '1400.00', gastos_netos: '1000.00', balance: '400.00', ahorro_pct: '28.5714285714285714' }]);
        }
        return l.args?.p_desde === '2026-10-01'
          ? ok([{ ingresos: '3420.00', gastos_netos: '961.68', balance: '342.00', ahorro_pct: '10.0000000000000000' }])
          : ok([{ ingresos: '0.00', gastos_netos: '900.00', balance: '-900.00', ahorro_pct: null }]);
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
    for (const l of de('rpc:resumen_periodo')) {
      expect(l.select).toBe('ingresos::text, gastos_netos::text, balance::text, ahorro_pct::text');
    }
    expect(de('rpc:progreso_objetivos')[0]?.select).toBe(
      'objetivo_id, tipo, categoria_id, importe::text, actual::text, exceso::text, restante::text, dias_restantes, ahorro_diario_necesario::text',
    );
    expect(de('rpc:peso_otros_gastos')[0]?.select).toBe('categoria_id, gasto::text, porcentaje::text, supera_umbral');
    expect(de('rpc:ingresos_por_categoria')[0]?.select).toBe('categoria_id, nombre, color, ingreso::text');
    for (const l of de('rpc:serie_patrimonio')) expect(l.select).toBe('fecha, patrimonio::text, provisional');
    for (const l of de('rpc:gasto_por_categoria')) expect(l.select).toBe('categoria_id, nombre, color, gasto::text');
    expect(de('movimientos')[0]?.select).toContain('importe::text');
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

  it('con análisis listo muestra UN consejo (su primera recomendación) como texto y enlaza a /analisis/YYYY-MM', async () => {
    escenario({
      analisis: {
        mes: '2026-09-01',
        contenido: {
          resumen: 'Buen mes.',
          destacados: ['Restaurantes fue tu primera categoría.', 'Ahorraste un 22,5 %.'],
          recomendaciones: ['<b>Pon</b> un límite de 250 € a Restaurantes.', 'Dos.'],
        },
      },
    });
    pintar();
    expect(await screen.findByText('De tu análisis de septiembre')).toBeInTheDocument();
    // Texto plano: el HTML no se interpreta. Las cifras repetidas (destacados) ya no salen.
    expect(screen.getByTestId('consejo-analisis')).toHaveTextContent('<b>Pon</b> un límite de 250 € a Restaurantes.');
    expect(screen.queryByText('Restaurantes fue tu primera categoría.')).not.toBeInTheDocument();
    expect(screen.queryByText('Dos.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el análisis completo →' })).toHaveAttribute('href', '/analisis/2026-09');
  });

  it('sin recomendaciones muestra su primer destacado; con insights, el primer insight', async () => {
    escenario({
      analisis: { mes: '2026-09-01', contenido: { resumen: 'Bien.', destacados: ['Destacado.'], recomendaciones: [] } },
    });
    const { unmount } = pintar();
    expect(await screen.findByTestId('consejo-analisis')).toHaveTextContent('Destacado.');
    unmount();
    escenario({
      analisis: {
        mes: '2026-09-01',
        contenido: {
          resumen: 'Bien.',
          destacados: ['Destacado.'],
          recomendaciones: ['Recomendación.'],
          insights: ['El 40 % del ocio fue en fin de semana.'],
        },
      },
    });
    pintar();
    expect(await screen.findByTestId('consejo-analisis')).toHaveTextContent('El 40 % del ocio fue en fin de semana.');
  });

  it('una recomendación estructurada ({ texto, accion }) se muestra por su texto', async () => {
    escenario({
      analisis: {
        mes: '2026-09-01',
        contenido: {
          resumen: 'Bien.',
          destacados: ['Destacado.'],
          recomendaciones: [{ texto: 'Pon un límite a Ocio.', accion: { tipo: 'crear_limite' } }],
        },
      },
    });
    pintar();
    expect(await screen.findByTestId('consejo-analisis')).toHaveTextContent('Pon un límite a Ocio.');
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
    expect(screen.getByTestId('mes-seleccionado')).toHaveTextContent(/^Octubre de 2026$/);
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeEnabled();
  });

  it('solo flechas: el mes es texto anunciado (aria-live), sin desplegable ni lista de meses', async () => {
    pintar();
    await screen.findByText('Patrimonio a 19/10/2026');
    const grupo = screen.getByRole('group', { name: 'Mes' });
    expect(within(grupo).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    const mes = within(grupo).getByTestId('mes-seleccionado');
    expect(mes).toHaveAttribute('aria-live', 'polite');
    expect(mes.tagName).toBe('SPAN');
    // Dentro del grupo solo hay dos controles: las flechas.
    expect(within(grupo).getAllByRole('button')).toHaveLength(2);
  });

  it('las flechas recorren los meses hasta el de la primera cuenta, que desactiva «anterior»', async () => {
    escenario({ inicioDatos: '2026-08-10' });
    pintarEn('/');
    await screen.findByText('Patrimonio a 19/10/2026');
    const anterior = screen.getByRole('button', { name: 'Mes anterior' });
    await userEvent.click(anterior);
    expect(await screen.findByText('Patrimonio a 30/09/2026')).toBeInTheDocument();
    expect(screen.getByTestId('mes-seleccionado')).toHaveTextContent('Septiembre de 2026');
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('?mes=2026-09');
    await userEvent.click(anterior);
    expect(await screen.findByText('Patrimonio a 31/08/2026')).toBeInTheDocument();
    expect(screen.getByTestId('mes-seleccionado')).toHaveTextContent('Agosto de 2026');
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('?mes=2026-08');
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled();
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

    expect(screen.getByTestId('mes-seleccionado')).toHaveTextContent(/^Septiembre de 2026$/);
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
    expect(screen.getByTestId('mes-seleccionado')).toHaveTextContent(/^Octubre de 2026$/);
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
    escenario({ progreso: [PROGRESO_AHORRO] });
    pintarEn('/?mes=2026-09');
    expect(await screen.findByText('Objetivos · octubre')).toBeInTheDocument();
    await screen.findByRole('progressbar', { name: /^Ahorrar 500,00\s€ al mes$/ });
    // progreso_objetivos se pide con hoy (19/10), no con el mes que se mira.
    const llamadas = sb.llamadas.filter((l) => l.origen === 'rpc:progreso_objetivos');
    expect(llamadas.map((l) => l.args)).toEqual([{ p_hoy: '2026-10-19' }]);
  });
});

describe('PaginaInicio · patrimonio por cuenta', () => {
  const base = {
    entidad: null,
    color: '#3366aa',
    emoji: null,
    es_principal: false,
    fecha_cierre: null,
    saldo_inicial: '0.00',
  };
  const CUENTAS = [
    { ...base, id: 'c3', nombre: 'Efectivo', tipo: 'efectivo', emoji: '💵', orden: 2, fecha_inicial: '2026-01-01' },
    { ...base, id: 'c2', nombre: 'Bróker Prueba', tipo: 'inversion', orden: 1, fecha_inicial: '2026-02-01' },
    { ...base, id: 'c1', nombre: 'Banco Uno', tipo: 'banco', es_principal: true, orden: 3, fecha_inicial: '2026-01-01' },
    { ...base, id: 'c4', nombre: 'Tarjeta Prueba', tipo: 'pasivo', orden: 4, fecha_inicial: '2026-03-01' },
    { ...base, id: 'c5', nombre: 'Banco Futuro', tipo: 'banco', orden: 5, fecha_inicial: '2026-10-25' },
    {
      ...base,
      id: 'c6',
      nombre: 'Banco Cerrado',
      tipo: 'banco',
      orden: 6,
      fecha_inicial: '2026-01-01',
      fecha_cierre: '2026-06-30',
    },
  ];
  // v_saldos: solo cuentas abiertas; la que aún no existe hoy tiene valor NULL.
  const SALDOS = [
    { id: 'c1', valor: '1200.50' },
    { id: 'c2', valor: '3000.00' },
    { id: 'c3', valor: '45.00' },
    { id: 'c4', valor: '-250.40' },
    { id: 'c5', valor: null },
  ];

  it('mes en curso: cada cuenta con su valor de hoy, principal primero y luego por orden', async () => {
    escenario({ cuentas: CUENTAS, saldos: SALDOS });
    pintar();
    const lista = await screen.findByRole('list', { name: 'Patrimonio por cuenta' });
    expect(lista.closest('article')).toHaveTextContent('Patrimonio a 19/10/2026');
    const filas = within(lista).getAllByRole('listitem');
    const nombres = ['Banco Uno', 'Bróker Prueba', 'Efectivo', 'Tarjeta Prueba'];
    expect(filas).toHaveLength(nombres.length);
    nombres.forEach((nombre, i) => expect(within(filas[i] as HTMLElement).getByText(nombre)).toBeInTheDocument());
    expect(filas[0]).toHaveTextContent(/1\.200,50\s€/);
    // El pasivo se muestra con su signo.
    expect(within(filas[3] as HTMLElement).getByText(/^-250,40\s€$/)).toHaveClass('text-negativo');
    // Ni la que aún no existe ni la cerrada.
    expect(within(lista).queryByText('Banco Futuro')).not.toBeInTheDocument();
    expect(within(lista).queryByText('Banco Cerrado')).not.toBeInTheDocument();
    // El valor viene como texto de v_saldos: nada de valor_cuenta escalar (número JSON).
    expect(sb.llamadas.find((l) => l.origen === 'v_saldos')?.select).toBe('id, valor::text');
    expect(sb.llamadas.some((l) => l.origen === 'rpc:valor_cuenta')).toBe(false);
  });

  it('mes en curso: no pide valores_cuentas', async () => {
    escenario({ cuentas: CUENTAS, saldos: SALDOS });
    pintar();
    await screen.findByRole('list', { name: 'Patrimonio por cuenta' });
    expect(sb.llamadas.some((l) => l.origen === 'rpc:valores_cuentas')).toBe(false);
  });

  it('mes cerrado: valores al cierre del último día (valores_cuentas, como texto), no los de hoy', async () => {
    // valores_cuentas(30/09) ya deja fuera la cerrada en junio y la que se abre en octubre.
    const cierre = [
      { cuenta_id: 'c2', valor: '2900.00' },
      { cuenta_id: 'c1', valor: '980.25' },
      { cuenta_id: 'c3', valor: '30.00' },
      { cuenta_id: 'c4', valor: '-120.00' },
    ];
    escenario({ cuentas: CUENTAS, saldos: SALDOS, valoresCierre: { '2026-09-30': cierre } });
    pintarEn('/?mes=2026-09');
    const titulo = await screen.findByRole('heading', { name: 'Patrimonio a 30/09/2026' });
    const tarjeta = titulo.closest('article');
    if (!tarjeta) throw new Error('sin tarjeta');
    const lista = await within(tarjeta).findByRole('list', { name: 'Patrimonio por cuenta' });
    const filas = within(lista).getAllByRole('listitem');
    expect(filas).toHaveLength(4);
    expect(filas[0]).toHaveTextContent('Banco Uno');
    expect(filas[0]).toHaveTextContent(/980,25\s€/);
    expect(within(filas[3] as HTMLElement).getByText(/^-120,00\s€$/)).toHaveClass('text-negativo');
    expect(within(tarjeta).queryByText(/1\.200,50/)).not.toBeInTheDocument();
    expect(within(lista).queryByText('Banco Futuro')).not.toBeInTheDocument();
    expect(within(lista).queryByText('Banco Cerrado')).not.toBeInTheDocument();
    expect(screen.queryByText(/solo está disponible/)).not.toBeInTheDocument();

    const llamadas = sb.llamadas.filter((l) => l.origen === 'rpc:valores_cuentas');
    expect(llamadas.map((l) => l.args)).toEqual([{ p_fecha: '2026-09-30' }]);
    expect(llamadas[0]?.select).toBe('cuenta_id, valor::text');
  });
});

const PROGRESO_AHORRO = {
  objetivo_id: 'o1', tipo: 'ahorro_mensual', categoria_id: null, importe: '500.00', actual: '342.00', exceso: null,
  restante: '158.00', dias_restantes: 13, ahorro_diario_necesario: '12.1538461538461538',
};
const PROGRESO_LIMITE = {
  objetivo_id: 'o2', tipo: 'limite_categoria', categoria_id: 'ocio', importe: '200.00', actual: '215.00',
  exceso: '15.00', restante: null, dias_restantes: 13, ahorro_diario_necesario: null,
};

describe('PaginaInicio · objetivos y movimientos', () => {
  it('ahorro: balance frente al objetivo con los días que quedan y el ahorro diario (SQL); límite superado: cuánto', async () => {
    escenario({ progreso: [PROGRESO_AHORRO, PROGRESO_LIMITE] });
    pintar();
    expect(await screen.findByText('Objetivos · octubre')).toBeInTheDocument();
    const ahorro = await screen.findByRole('progressbar', { name: /^Ahorrar 500,00\s€ al mes$/ });
    expect(ahorro).toHaveAttribute('aria-valuenow', '68');
    const sinEspacios = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ');
    // 158 € en 13 días (19..31): 12,153846… → 12,15 €/día, redondeado solo al mostrar.
    expect(sinEspacios(ahorro.getAttribute('aria-valuetext'))).toBe(
      '342,00 € / 500,00 € · Te quedan 13 días · necesitas ahorrar 12,15 €/día',
    );

    const limite = screen.getByRole('progressbar', { name: /^Ocio por debajo de 200,00\s€$/ });
    expect(limite).toHaveAttribute('aria-valuenow', '100');
    expect(limite.firstElementChild).toHaveClass('bg-negativo');
    expect(screen.getByText('Superado')).toHaveClass('text-negativo');
    const detalles = screen.getAllByTestId('detalle-objetivo').map((d) => sinEspacios(d.textContent));
    expect(detalles).toEqual(['Te quedan 13 días · necesitas ahorrar 12,15 €/día', 'Superado en 15,00 €']);
  });

  it('ahorro conseguido: «Conseguido» y sin proyección; último día: «hoy»', async () => {
    escenario({ progreso: [{ ...PROGRESO_AHORRO, actual: '600.00', restante: null, ahorro_diario_necesario: null }] });
    const { unmount } = pintar();
    expect(await screen.findByText('Conseguido')).toHaveClass('text-positivo');
    expect(screen.queryByTestId('detalle-objetivo')).not.toBeInTheDocument();
    unmount();
    escenario({
      progreso: [{ ...PROGRESO_AHORRO, dias_restantes: 1, ahorro_diario_necesario: '158.0000000000000000' }],
    });
    pintar();
    expect((await screen.findByTestId('detalle-objetivo')).textContent?.replace(/\s+/g, ' ')).toBe(
      'Queda 1 día · necesitas ahorrar 158,00 € hoy',
    );
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

describe('PaginaInicio · balance del mes, top 3 y enlaces', () => {
  it('cuarta cifra: balance de 1..hoy con su ahorro (SQL)', async () => {
    pintar();
    const balance = (await screen.findByRole('heading', { name: 'Balance · 1–19 oct' })).closest('article');
    if (!balance) throw new Error('sin tarjeta');
    expect(within(balance).getByText(/^\+342,00\s€$/)).toBeInTheDocument();
    expect(within(balance).getByTestId('kpi-ahorro')).toHaveTextContent('Ahorro 10,0 %');
  });

  it('mes cerrado: balance del mes completo con el ahorro de la sección 3 (22,5 %)', async () => {
    pintarEn('/?mes=2026-09');
    const balance = (await screen.findByRole('heading', { name: 'Balance · 1–30 sept' })).closest('article');
    if (!balance) throw new Error('sin tarjeta');
    expect(within(balance).getByText(/^\+339,72\s€$/)).toBeInTheDocument();
    expect(within(balance).getByTestId('kpi-ahorro')).toHaveTextContent('Ahorro 22,5 %');
    // 400,00 → 339,72: −15,1 %; que baje el balance es rojo.
    expect(within(balance).getByText('-15,1 %').parentElement).toHaveClass('text-negativo');
  });

  it('top 3 de categorías de gasto y de ingreso, de mayor a menor', async () => {
    escenario({
      ingresosCategorias: [{ categoria_id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', ingreso: '3420.00' }],
    });
    pintar();
    const gastos = await screen.findByRole('list', { name: 'Principales categorías de gasto' });
    expect(within(gastos).getAllByRole('listitem').map((li) => li.textContent?.replace(/\s+/g, ' '))).toEqual([
      'Transporte746,68 €',
      'Ocio215,00 €',
    ]);
    const ingresos = await screen.findByRole('list', { name: 'Principales categorías de ingreso' });
    expect(within(ingresos).getByText('Nómina')).toBeInTheDocument();
  });

  it('cada categoría del donut abre Movimientos filtrado por esa categoría y el tramo del mes', async () => {
    pintar();
    const lista = await screen.findByRole('list', { name: 'Gasto neto por categoría' });
    expect(within(lista).getByRole('link', { name: /Ocio/ })).toHaveAttribute(
      'href',
      '/movimientos?categoria=ocio&desde=2026-10-01&hasta=2026-10-19',
    );
  });

  it('mes cerrado: el enlace del donut lleva el mes completo', async () => {
    pintarEn('/?mes=2026-09');
    const lista = await screen.findByRole('list', { name: 'Gasto neto por categoría' });
    expect(within(lista).getByRole('link', { name: /Transporte/ })).toHaveAttribute(
      'href',
      '/movimientos?categoria=trans&desde=2026-09-01&hasta=2026-09-30',
    );
  });
});

describe('PaginaInicio · aviso de «Otros gastos»', () => {
  const OTROS = {
    id: 'otros', nombre: 'Otros gastos', tipo: 'gasto', color: '#8f9bbd', icono: null, orden: 9, archivada: false,
    clave: 'otros_gastos',
  };

  it('si pasa del 20 % avisa con su % y su importe, y «Recategorizar» abre Movimientos filtrado', async () => {
    escenario({
      pesoOtros: [{ categoria_id: 'otros', gasto: '250.00', porcentaje: '25.9961000000000000', supera_umbral: true }],
      categorias: [...CATEGORIAS, OTROS],
    });
    pintar();
    const aviso = await screen.findByTestId('aviso-otros-gastos');
    await waitFor(() =>
      expect(aviso.textContent?.replace(/\s+/g, ' ')).toContain('«Otros gastos» es el 26,0 % de tu gasto del mes (250,00 €)'),
    );
    expect(within(aviso).getByRole('link', { name: 'Recategorizar' })).toHaveAttribute(
      'href',
      '/movimientos?categoria=otros&desde=2026-10-01&hasta=2026-10-19',
    );
    expect(sb.llamadas.filter((l) => l.origen === 'rpc:peso_otros_gastos').map((l) => l.args)).toContainEqual({
      p_desde: '2026-10-01',
      p_hasta: '2026-10-19',
    });
  });

  it('en inglés usa el nombre traducido por su clave', async () => {
    escenario({
      pesoOtros: [{ categoria_id: 'otros', gasto: '250.00', porcentaje: '25.0', supera_umbral: true }],
      categorias: [...CATEGORIAS, OTROS],
    });
    renderConApp(<PaginaInicio />, { sesion: sesionFalsa('u1'), idioma: 'en' });
    const aviso = await screen.findByTestId('aviso-otros-gastos');
    await waitFor(() => expect(aviso.textContent).toMatch(/“Other expenses” is 25\.0\s?%/));
    expect(within(aviso).getByRole('link', { name: 'Recategorise' })).toBeInTheDocument();
  });

  it('20 % o menos: sin aviso', async () => {
    escenario({ pesoOtros: [{ categoria_id: 'otros', gasto: '20.00', porcentaje: '20.0', supera_umbral: false }] });
    pintar();
    await screen.findByText('Patrimonio a 19/10/2026');
    await waitFor(() => expect(sb.llamadas.some((l) => l.origen === 'rpc:peso_otros_gastos')).toBe(true));
    expect(screen.queryByTestId('aviso-otros-gastos')).not.toBeInTheDocument();
  });
});
