import { Route, Routes, useLocation } from 'react-router';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import { CATEGORIAS, CUENTAS, ID, movimiento } from './test/datos';
import { operacion, paso, pasos, type Llamada, type Respuesta, type crearSupabaseFalso } from './test/supabaseFalso';
import type { Movimiento } from './lib/tipos';

const falso = vi.hoisted(() => ({ mod: null as null | ReturnType<typeof crearSupabaseFalso> }));

vi.mock('@/shared/lib/supabase', async () => {
  const { crearSupabaseFalso: crear } = await import('./test/supabaseFalso');
  falso.mod = crear();
  return { supabase: falso.mod.supabase };
});

const { default: PaginaMovimientos } = await import('./pages/PaginaMovimientos');
const { default: PaginaNuevoMovimiento } = await import('./pages/PaginaNuevoMovimiento');
const { default: PaginaDetalleMovimiento } = await import('./pages/PaginaDetalleMovimiento');
const { default: PaginaEditarMovimiento } = await import('./pages/PaginaEditarMovimiento');

function db() {
  if (!falso.mod) throw new Error('supabase falso sin iniciar');
  return falso.mod.estado;
}

/** Respuestas por defecto: catálogos + `movs` para las consultas de movimientos. */
function responderCon(movs: Movimiento[], extra?: (l: Llamada) => Respuesta | undefined) {
  db().responder = (l) => {
    const propia = extra?.(l);
    if (propia) return propia;
    if (l.tabla === 'cuentas') return { data: CUENTAS, error: null };
    if (l.tabla === 'v_saldos') return { data: [], error: null };
    if (l.tabla === 'categorias') return { data: CATEGORIAS, error: null };
    if (l.tabla === 'movimientos') {
      const porId = paso(l, 'eq');
      if (paso(l, 'maybeSingle') && porId?.[1] === 'id') {
        return { data: movs.find((m) => m.id === porId[2]) ?? null, error: null };
      }
      return { data: movs, error: null };
    }
    return { data: [], error: null };
  };
}

const llamadasMovimientos = (op: 'select' | 'insert' | 'update' | 'delete') =>
  db().llamadas.filter((l) => l.tabla === 'movimientos' && operacion(l) === op);

function Ubicacion() {
  const { pathname, search } = useLocation();
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>;
}

function renderRuta(ruta: string) {
  return renderConApp(
    <>
      <Routes>
        <Route path="/movimientos" element={<PaginaMovimientos />} />
        <Route path="/movimientos/nuevo" element={<PaginaNuevoMovimiento />} />
        <Route path="/movimientos/:id" element={<PaginaDetalleMovimiento />} />
        <Route path="/movimientos/:id/editar" element={<PaginaEditarMovimiento />} />
      </Routes>
      <Ubicacion />
    </>,
    { ruta, sesion: sesionFalsa() },
  );
}

/** Categoría del formulario: cuadrícula de chips (radiogroup). */
async function elegirCategoria(nombre: string) {
  const grupo = await screen.findByRole('radiogroup', { name: 'Categoría' });
  await userEvent.click(within(grupo).getByRole('radio', { name: new RegExp(`^${nombre}`) }));
}

const ubicacion = () => screen.getByTestId('ubicacion').textContent ?? '';
/** Intl separa «€» con espacio duro: se compara con espacios normales. */
const conTexto = (texto: string) => (_: string, el: Element | null) =>
  el !== null && el.children.length === 0 && (el.textContent ?? '').replace(/\s/g, ' ') === texto;

beforeEach(() => {
  db().llamadas.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  // Martes 20/10/2026 a las 10:00 en Madrid (sección 11, «Fecha real»).
  vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const LISTA: Movimiento[] = [
  movimiento({ id: ID.mov1, fecha: '2026-10-14', tipo: 'devolucion', importe: '24.00', concepto: 'Devolución entradas', metodo: 'bizum' }),
  movimiento({ id: ID.mov2, fecha: '2026-10-12', tipo: 'gasto', importe: '38.50', concepto: 'Cena con amigos', categoria_id: ID.restaurantes }),
  movimiento({
    id: ID.mov3,
    fecha: '2026-10-10',
    tipo: 'traspaso',
    importe: '100.00',
    concepto: 'Ahorro del mes',
    categoria_id: null,
    metodo: null,
    cuenta_destino_id: ID.ing,
  }),
  movimiento({
    id: ID.mov4,
    fecha: '2026-10-03',
    tipo: 'ajuste',
    importe: '3.12',
    sentido: 'suma',
    concepto: 'Ajuste de saldo',
    categoria_id: null,
    metodo: null,
    cuenta_id: ID.ing,
  }),
  movimiento({ id: ID.mov5, fecha: '2026-09-30', tipo: 'ingreso', importe: '1258.00', concepto: 'Nómina', categoria_id: ID.nomina, metodo: 'transferencia' }),
];

describe('Lista de movimientos', () => {
  it('agrupa por día con el subtotal de SQL y pone el signo según el tipo; las filas no repiten la fecha', async () => {
    responderCon(LISTA, (l) =>
      l.tabla === 'rpc:subtotales_por_dia'
        ? {
            data: [
              { fecha: '2026-10-14', n: 1, balance: '24.00' },
              { fecha: '2026-10-12', n: 1, balance: '-38.50' },
              { fecha: '2026-10-10', n: 1, balance: null },
            ],
            error: null,
          }
        : undefined,
    );
    renderRuta('/movimientos');

    const dia14 = await screen.findByRole('heading', { name: /^14 oct/ });
    await waitFor(() => expect(dia14.textContent?.replace(/\s/g, ' ')).toBe('14 octBalance del día: +24,00 €'));
    const dia12 = screen.getByRole('heading', { name: /^12 oct/ });
    expect(dia12.textContent?.replace(/\s/g, ' ')).toContain('-38,50 €');
    // Un día solo con traspasos no tiene balance (no se inventa un 0)
    expect(screen.getByRole('heading', { name: /^10 oct/ }).textContent).toBe('10 oct');
    expect(screen.getByRole('heading', { name: /^30 sept|^30 sep/ })).toBeInTheDocument();

    // El subtotal se pide a SQL con los mismos filtros, desde el día más antiguo cargado
    const rpc = db().llamadas.find((l) => l.tabla === 'rpc:subtotales_por_dia');
    expect(paso(rpc, 'rpc')?.[1]).toMatchObject({ p_desde: '2026-09-30', p_hasta: null, p_tipo: null, p_q: null });
    expect(String(paso(rpc, 'select')?.[1])).toContain('balance::text');

    const lista = screen.getByRole('region', { name: 'Lista de movimientos' });
    expect(within(lista).getByText(conTexto('+24,00 €'), { selector: 'a span' })).toHaveClass('text-positivo');
    expect(within(lista).getByText(conTexto('-38,50 €'), { selector: 'a span' })).toHaveClass('text-negativo');
    expect(within(lista).getByText(conTexto('100,00 €'))).toHaveClass('text-apagado');
    expect(within(lista).getByText(conTexto('+3,12 €'))).toHaveClass('text-apagado');
    expect(within(lista).getByText(conTexto('+1.258,00 €'))).toHaveClass('text-positivo');
    // Meta sin fecha; traspasos y ajustes: icono + texto para lectores de pantalla
    expect(within(lista).getByText('Banco Uno → Banco Dos')).toBeInTheDocument();
    expect(within(lista).getByText('No cuenta en el balance')).toHaveClass('sr-only');
    expect(within(lista).getByText('Ajuste · Banco Dos')).toBeInTheDocument();
    expect(within(lista).getByText('No cuenta en el balance: se muestra aparte')).toHaveClass('sr-only');
    expect(within(lista).getByText('Restaurantes · Tarjeta')).toBeInTheDocument();
    expect(within(lista).queryByText(/12 oct ·/)).not.toBeInTheDocument();
    // Cada fila es un enlace al detalle
    expect(screen.getByRole('link', { name: /Cena con amigos/ })).toHaveAttribute('href', `/movimientos/${ID.mov2}`);
  });

  it('chips con número y total por tipo de SQL («Gastos · 38 · −863 €»), sin el filtro de tipo', async () => {
    responderCon(LISTA, (l) =>
      l.tabla === 'rpc:totales_por_tipo'
        ? {
            data: [
              { tipo: 'gasto', n: 38, total: '863.40' },
              { tipo: 'ingreso', n: 2, total: '1258.00' },
              { tipo: 'ajuste', n: 1, total: '-5.00' },
            ],
            error: null,
          }
        : undefined,
    );
    renderRuta('/movimientos?tipo=gasto&q=cena');
    const nombre = (b: HTMLElement) => (b.textContent ?? '').replace(/\s/g, ' ');
    await waitFor(() => expect(nombre(screen.getByRole('button', { name: /^Gastos/ }))).toBe('Gastos · 38 · -863 €'));
    expect(nombre(screen.getByRole('button', { name: /^Todos/ }))).toBe('Todos · 41');
    expect(nombre(screen.getByRole('button', { name: /^Ingresos/ }))).toBe('Ingresos · 2 · +1.258 €');
    expect(nombre(screen.getByRole('button', { name: /^Ajustes/ }))).toBe('Ajustes · 1 · -5 €');
    expect(nombre(screen.getByRole('button', { name: /^Traspasos/ }))).toBe('Traspasos · 0');
    const rpc = db().llamadas.find((l) => l.tabla === 'rpc:totales_por_tipo');
    expect(paso(rpc, 'rpc')?.[1]).toEqual({ p_q: 'cena', p_desde: null, p_hasta: null, p_categoria: null, p_metodo: null, p_cuenta: null });
  });

  it('chips: dicen de qué periodo son los totales y los traspasos solo llevan el número (F09)', async () => {
    responderCon(LISTA, (l) =>
      l.tabla === 'rpc:totales_por_tipo' ? { data: [{ tipo: 'traspaso', n: 6, total: '539.00' }], error: null } : undefined,
    );
    const { unmount } = renderRuta('/movimientos');
    const nombre = (b: HTMLElement) => (b.textContent ?? '').replace(/\s/g, ' ');
    // Idas y vueltas entre cuentas: su suma no es ningún total.
    await waitFor(() => expect(nombre(screen.getByRole('button', { name: /^Traspasos/ }))).toBe('Traspasos · 6'));
    expect(screen.getByTestId('periodo-totales')).toHaveTextContent('Totales de todo el historial');
    unmount();
    renderRuta('/movimientos?desde=2026-10-01&hasta=2026-10-31');
    expect(await screen.findByTestId('periodo-totales')).toHaveTextContent('Totales del 01/10/2026 al 31/10/2026');
  });

  it('filtros activos como chips con ✕ sobre la lista; quitarlos actualiza la URL (F17)', async () => {
    responderCon(LISTA);
    renderRuta(`/movimientos?desde=2026-10-01&hasta=2026-10-31&categoria=${ID.restaurantes}&q=cena`);
    const grupo = await screen.findByRole('group', { name: 'Filtros activos' });
    const chips = within(grupo).getAllByTestId('filtro-activo').map((c) => c.textContent);
    expect(chips).toEqual(['01/10/2026 – 31/10/2026', 'Restaurantes', '«cena»']);
    await userEvent.click(within(grupo).getByRole('button', { name: 'Quitar filtro: Restaurantes' }));
    await waitFor(() => expect(ubicacion()).not.toContain('categoria='));
    expect(ubicacion()).toContain('desde=2026-10-01');
    await userEvent.click(within(grupo).getByRole('button', { name: 'Quitar todos' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Filtros activos' })).not.toBeInTheDocument());
    expect(ubicacion()).not.toMatch(/desde=|hasta=|q=/);
  });

  it('día cortado por la paginación: su total es del día entero y se avisa de lo que falta (F09)', async () => {
    const muchos = Array.from({ length: 51 }, (_, i) =>
      movimiento({
        id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`,
        fecha: i < 48 ? '2026-10-14' : '2026-10-13',
        created_at: `2026-10-14T10:${String(59 - i).padStart(2, '0')}:00+00:00`,
        concepto: `Gasto ${i}`,
      }),
    );
    responderCon([], (l) => {
      if (l.tabla === 'rpc:subtotales_por_dia') {
        // El 13 tiene 5 movimientos; la primera página solo trae 2.
        return { data: [{ fecha: '2026-10-14', n: 48, balance: '-480.00' }, { fecha: '2026-10-13', n: 5, balance: '-50.00' }], error: null };
      }
      return l.tabla === 'movimientos' ? { data: muchos, error: null } : undefined;
    });
    renderRuta('/movimientos');
    expect(await screen.findByTestId('mas-del-dia')).toHaveTextContent('Ver 3 movimientos más de este día');
    expect(screen.getAllByTestId('mas-del-dia')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /^13 oct/ })).toHaveTextContent('incluidos los movimientos aún no cargados');
  });

  it('atajos de periodo en el panel de filtros: este mes, mes pasado y últimos 30 días (F17)', async () => {
    responderCon(LISTA);
    renderRuta('/movimientos');
    await screen.findByRole('heading', { name: /^14 oct/ });
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Filtros' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Mes pasado' }));
    expect(within(dialogo).getByLabelText('Desde')).toHaveValue('2026-09-01');
    expect(within(dialogo).getByLabelText('Hasta')).toHaveValue('2026-09-30');
    expect(within(dialogo).getByRole('button', { name: 'Mes pasado' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(ubicacion()).toContain('desde=2026-09-01'));
    expect(ubicacion()).toContain('hasta=2026-09-30');
  });

  it('escritorio sin selección: resumen del filtro activo calculado en SQL', async () => {
    responderCon(LISTA, (l) =>
      l.tabla === 'rpc:resumen_filtro'
        ? {
            data: [
              {
                n: 5,
                ingresos: '1258.00',
                gastos_netos: '14.50',
                balance: '1243.50',
                ajustes: '3.12',
                dias: 21,
                gasto_medio_diario: '0.6904761904761905',
                categoria_id: ID.restaurantes,
                categoria_gasto: '38.50',
              },
            ],
            error: null,
          }
        : undefined,
    );
    renderRuta('/movimientos');
    const panel = await screen.findByRole('complementary', { name: 'Resumen de tus movimientos' });
    await within(panel).findByText('5');
    const valor = (etiqueta: string) =>
      within(panel).getByText(etiqueta).nextElementSibling?.textContent?.replace(/\s/g, ' ');
    expect(valor('Balance')).toBe('+1.243,50 €');
    expect(valor('Gastos netos')).toBe('14,50 €');
    expect(valor('Gasto medio diario')).toBe('0,69 €');
    expect(within(panel).getByText('en 21 días')).toBeInTheDocument();
    expect(valor('Categoría principal')).toBe('Restaurantes');
    expect(valor('Ajustes (no cuentan en el balance)')).toBe('+3,12 €');
  });

  it('móvil: deslizar una fila muestra Editar y Borrar; borrar pide confirmación', async () => {
    responderCon(LISTA, (l) =>
      l.tabla === 'movimientos' && operacion(l) === 'delete' ? { data: [{ id: ID.mov2 }], error: null } : undefined,
    );
    renderRuta('/movimientos');
    const fila = await screen.findByRole('link', { name: /Cena con amigos/ });
    const acciones = within(fila.closest('li') as HTMLElement).getByTestId('acciones-fila');
    expect(acciones).toHaveAttribute('inert');
    // En reposo no asoma ni un píxel del panel por las esquinas de la fila (F12).
    expect(acciones).toHaveClass('invisible');

    fireEvent.touchStart(fila, { touches: [{ clientX: 300, clientY: 20 }] });
    fireEvent.touchMove(fila, { touches: [{ clientX: 120, clientY: 24 }] });
    fireEvent.touchEnd(fila, { touches: [] });
    expect(acciones).not.toHaveAttribute('inert');
    expect(acciones).not.toHaveClass('invisible');
    expect(within(acciones).getByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/movimientos/${ID.mov2}/editar`);

    await userEvent.click(within(acciones).getByRole('button', { name: 'Borrar' }));
    const dialogo = await screen.findByRole('dialog', { name: '¿Borrar este movimiento?' });
    expect(llamadasMovimientos('delete')).toHaveLength(0);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Borrar' }));
    await waitFor(() => expect(llamadasMovimientos('delete')).toHaveLength(1));
    expect(pasos(llamadasMovimientos('delete')[0], 'eq')).toEqual([['eq', 'id', ID.mov2]]);
  });

  it('un desplazamiento vertical no abre las acciones (es scroll)', async () => {
    responderCon(LISTA);
    renderRuta('/movimientos');
    const fila = await screen.findByRole('link', { name: /Cena con amigos/ });
    fireEvent.touchStart(fila, { touches: [{ clientX: 300, clientY: 20 }] });
    fireEvent.touchMove(fila, { touches: [{ clientX: 290, clientY: 200 }] });
    fireEvent.touchEnd(fila, { touches: [] });
    expect(within(fila.closest('li') as HTMLElement).getByTestId('acciones-fila')).toHaveAttribute('inert');
  });

  it('pide importes como texto, en orden keyset y de 50 en 50 (+1 para saber si hay más)', async () => {
    const muchos = Array.from({ length: 51 }, (_, i) =>
      movimiento({
        id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`,
        fecha: '2026-10-14',
        created_at: `2026-10-14T10:${String(59 - i).padStart(2, '0')}:00+00:00`,
        concepto: `Gasto ${i}`,
      }),
    );
    let pagina = 0;
    responderCon([], (l) => {
      if (l.tabla !== 'movimientos') return undefined;
      pagina += 1;
      return { data: pagina === 1 ? muchos : [movimiento({ id: ID.mov5, fecha: '2026-10-01', concepto: 'Último' })], error: null };
    });
    renderRuta('/movimientos');

    expect(await screen.findByText('Gasto 49')).toBeInTheDocument();
    expect(screen.queryByText('Gasto 50')).not.toBeInTheDocument();
    const primera = llamadasMovimientos('select')[0];
    expect(String(paso(primera, 'select')?.[1])).toContain('importe::text');
    expect(pasos(primera, 'order').map((p) => p[1])).toEqual(['fecha', 'created_at', 'id']);
    expect(paso(primera, 'limit')?.[1]).toBe(51);

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByText('Último')).toBeInTheDocument();
    const segunda = llamadasMovimientos('select')[1];
    const ultimo = muchos[49];
    expect(String(paso(segunda, 'or')?.[1])).toContain(`id.lt."${ultimo?.id}"`);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('la búsqueda va a la URL y llega a la consulta sin caracteres reservados', async () => {
    responderCon(LISTA);
    renderRuta('/movimientos');
    await screen.findByRole('heading', { name: /^14 oct/ });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'cena),id.neq.0');
    await waitFor(() => expect(ubicacion()).toContain('q=cena'));
    await waitFor(() => {
      const ors = llamadasMovimientos('select').flatMap((l) => pasos(l, 'or').map((p) => String(p[1])));
      expect(ors).toContain('concepto.ilike."*cena id neq 0*",comercio.ilike."*cena id neq 0*"');
    });
  });

  it('filtros en la URL: se leen al entrar, los chips los cambian y se conservan los demás', async () => {
    responderCon(LISTA);
    renderRuta(`/movimientos?tipo=gasto&cuenta=${ID.caixa}`);
    await screen.findByRole('heading', { name: /^14 oct/ });

    expect(screen.getByRole('button', { name: /^Gastos/ })).toHaveAttribute('aria-pressed', 'true');
    const consulta = llamadasMovimientos('select')[0];
    expect(pasos(consulta, 'eq')).toContainEqual(['eq', 'tipo', 'gasto']);
    expect(pasos(consulta, 'or')).toContainEqual(['or', `cuenta_id.eq.${ID.caixa},cuenta_destino_id.eq.${ID.caixa}`]);

    await userEvent.click(screen.getByRole('button', { name: /^Ingresos/ }));
    expect(ubicacion()).toBe(`/movimientos?tipo=ingreso&cuenta=${ID.caixa}`);
    await userEvent.click(screen.getByRole('button', { name: /^Todos/ }));
    expect(ubicacion()).toBe(`/movimientos?cuenta=${ID.caixa}`);
  });

  it('el panel de filtros (hoja en móvil) escribe fechas y método en la URL', async () => {
    responderCon(LISTA);
    renderRuta('/movimientos');
    await screen.findByRole('heading', { name: /^14 oct/ });

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const hoja = await screen.findByRole('dialog', { name: 'Filtros' });
    fireEvent.change(within(hoja).getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(hoja).getByLabelText('Hasta'), { target: { value: '2026-10-31' } });
    await userEvent.selectOptions(within(hoja).getByLabelText('Método de pago'), 'bizum');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Aplicar' }));

    expect(ubicacion()).toBe('/movimientos?desde=2026-10-01&hasta=2026-10-31&metodo=bizum');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros (3)' })).toBeInTheDocument();
  });

  it('sin resultados con filtros ofrece quitarlos', async () => {
    responderCon([]);
    renderRuta('/movimientos?tipo=gasto&q=nada');
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar filtros' }));
    expect(ubicacion()).toBe('/movimientos');
  });

  it('sin ajustes (y sin más filtros) no es «sin resultados»: todavía no has hecho ninguno', async () => {
    responderCon([]);
    renderRuta('/movimientos?tipo=ajuste');
    expect(await screen.findByText('Todavía no has hecho ningún ajuste')).toBeInTheDocument();
    expect(screen.queryByText('No hay movimientos con estos filtros')).not.toBeInTheDocument();
  });
});

describe('Categorías por defecto traducidas', () => {
  // Ocio y Nómina son las por defecto (con clave); «Comidas fuera» es una por defecto que el
  // usuario renombró (ya sin clave) y se ve tal cual en cualquier idioma.
  const CATEGORIAS_CON_CLAVE = CATEGORIAS.map((c) =>
    c.id === ID.ocio
      ? { ...c, clave: 'ocio' }
      : c.id === ID.nomina
        ? { ...c, clave: 'nomina' }
        : { ...c, nombre: 'Comidas fuera', clave: null },
  );
  const responder = () =>
    responderCon(LISTA, (l) => (l.tabla === 'categorias' ? { data: CATEGORIAS_CON_CLAVE, error: null } : undefined));
  const renderConIdioma = (ruta: string, idioma: 'en' | 'ca') =>
    renderConApp(
      <Routes>
        <Route path="/movimientos" element={<PaginaMovimientos />} />
        <Route path="/movimientos/nuevo" element={<PaginaNuevoMovimiento />} />
      </Routes>,
      { ruta, sesion: sesionFalsa(), idioma },
    );

  it('en inglés, la lista y el panel de filtros muestran el nombre traducido; las propias, tal cual', async () => {
    responder();
    renderConIdioma('/movimientos', 'en');
    expect(await screen.findByText(/^Leisure · /)).toBeInTheDocument();
    expect(screen.getByText(/^Comidas fuera · /)).toBeInTheDocument();
    expect(screen.getByText(/^Salary · /)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const hoja = await screen.findByRole('dialog', { name: 'Filters' });
    const opciones = within(within(hoja).getByLabelText('Category')).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(expect.arrayContaining(['Leisure', 'Comidas fuera', 'Salary']));
    expect(opciones).not.toContain('Ocio');
  });

  it('en catalán, el selector del formulario también', async () => {
    responder();
    renderConIdioma('/movimientos/nuevo', 'ca');
    const selector = await screen.findByRole('radiogroup', { name: 'Categoria' });
    expect(within(selector).getByRole('radio', { name: 'Oci' })).toHaveTextContent('🎉');
    expect(within(selector).getByRole('radio', { name: 'Comidas fuera' })).toBeInTheDocument();
  });
});

describe('Detalle y borrado', () => {
  it('muestra la fecha real, cuándo se apuntó y si cuenta en el balance', async () => {
    const m = movimiento({
      id: ID.mov2,
      fecha: '2026-10-17',
      created_at: '2026-10-19T22:30:00+00:00', // 20/10 a las 00:30 en Madrid
      concepto: 'Cena con amigos',
      categoria_id: ID.restaurantes,
      metodo: 'apple_pay',
      origen: 'apple_pay',
      importe: '38.00',
      notas: 'Cena en el centro',
    });
    responderCon([m]);
    renderRuta(`/movimientos/${ID.mov2}`);

    expect(await screen.findByRole('heading', { name: 'Cena con amigos' })).toBeInTheDocument();
    expect(screen.getByText('17/10/2026 · apuntado el 20/10/2026')).toBeInTheDocument();
    expect(screen.getByText(conTexto('-38,00 €'))).toBeInTheDocument();
    expect(screen.getByText('Sale de Banco Uno')).toBeInTheDocument();
    expect(screen.getByText('Apple Pay (atajo)')).toBeInTheDocument();
    expect(screen.getByText('Sí, suma a los gastos del mes.')).toBeInTheDocument();
    expect(screen.getByText('Cena en el centro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/movimientos/${ID.mov2}/editar`);
  });

  it('traspaso: explica que no cuenta en el balance', async () => {
    responderCon([LISTA[2] as Movimiento]);
    renderRuta(`/movimientos/${ID.mov3}`);
    expect(await screen.findByText('Banco Uno → Banco Dos')).toBeInTheDocument();
    expect(screen.getByText(/No: es dinero tuyo moviéndose entre tus cuentas/)).toBeInTheDocument();
  });

  it('borrar pide confirmación; cancelar no borra', async () => {
    responderCon(LISTA, (l) =>
      l.tabla === 'movimientos' && operacion(l) === 'delete' ? { data: [{ id: ID.mov2 }], error: null } : undefined,
    );
    renderRuta(`/movimientos/${ID.mov2}`);
    await screen.findByRole('heading', { name: 'Cena con amigos' });

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    const dialogo = await screen.findByRole('dialog', { name: '¿Borrar este movimiento?' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(llamadasMovimientos('delete')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    const otra = await screen.findByRole('dialog', { name: '¿Borrar este movimiento?' });
    await userEvent.click(within(otra).getByRole('button', { name: 'Borrar' }));

    await waitFor(() => expect(ubicacion()).toBe('/movimientos'));
    const borrado = llamadasMovimientos('delete')[0];
    expect(pasos(borrado, 'eq')).toEqual([['eq', 'id', ID.mov2]]);
  });

  it('con una cuenta cerrada no deja editar ni borrar', async () => {
    responderCon([movimiento({ id: ID.mov1, concepto: 'Antiguo', cuenta_id: ID.cerrada, fecha: '2026-03-01' })]);
    renderRuta(`/movimientos/${ID.mov1}`);
    expect(await screen.findByText(/La cuenta Banco Viejo está cerrada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
  });
});

describe('Formulario', () => {
  const respuestaInsert = (l: Llamada): Respuesta | undefined =>
    l.tabla === 'movimientos' && operacion(l) === 'insert' ? { data: { id: 'nuevo' }, error: null } : undefined;

  const insertado = () => paso(llamadasMovimientos('insert')[0], 'insert')?.[1];

  it('fecha real (sección 11): un gasto apuntado el martes 20/10 con fecha sábado 17/10 se envía con fecha 2026-10-17', async () => {
    responderCon([], respuestaInsert);
    renderRuta('/movimientos/nuevo');

    const importe = await screen.findByLabelText('Importe');
    await userEvent.type(importe, '38,5');
    await elegirCategoria('Restaurantes');
    expect(screen.getByLabelText('Sale de')).toHaveValue(ID.caixa); // principal por defecto
    expect(screen.getByLabelText('Fecha en que ocurrió')).toHaveValue('2026-10-20'); // hoy en Madrid
    fireEvent.change(screen.getByLabelText('Fecha en que ocurrió'), { target: { value: '2026-10-17' } });
    await userEvent.type(screen.getByLabelText('Concepto'), 'Cena');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(insertado()).toBeDefined());
    expect(insertado()).toEqual({
      tipo: 'gasto',
      importe: '38.50',
      fecha: '2026-10-17',
      concepto: 'Cena',
      notas: null,
      categoria_id: ID.restaurantes,
      metodo: 'tarjeta',
      cuenta_id: ID.caixa,
      cuenta_destino_id: null,
      devolucion_de: null,
      sentido: null,
      origen: 'app',
    });
  });

  it('no envía nada inválido: importe 0 y fecha futura', async () => {
    responderCon([], respuestaInsert);
    renderRuta('/movimientos/nuevo');
    await userEvent.type(await screen.findByLabelText('Importe'), '0');
    fireEvent.change(screen.getByLabelText('Fecha en que ocurrió'), { target: { value: '2026-10-21' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Introduce un importe mayor que 0.')).toBeInTheDocument();
    expect(screen.getByText('La fecha no puede ser futura: apunta el día en que ocurrió.')).toBeInTheDocument();
    expect(llamadasMovimientos('insert')).toHaveLength(0);
  });

  it('elegir efectivo como método cambia la cuenta a Efectivo', async () => {
    responderCon([]);
    renderRuta('/movimientos/nuevo');
    await userEvent.selectOptions(await screen.findByLabelText('Método de pago'), 'efectivo');
    expect(screen.getByLabelText('Sale de')).toHaveValue(ID.efectivo);
    // las cuentas cerradas no se ofrecen
    expect(within(screen.getByLabelText('Sale de')).queryByRole('option', { name: 'Banco Viejo' })).not.toBeInTheDocument();
  });

  it('ingreso: la cuenta es la de destino («Entra en») y va en cuenta_id', async () => {
    responderCon([], respuestaInsert);
    renderRuta('/movimientos/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Ingreso' }));
    await userEvent.type(screen.getByLabelText('Importe'), '1.258,00');
    await elegirCategoria('Nómina');
    await userEvent.selectOptions(screen.getByLabelText('Entra en'), ID.ing);
    await userEvent.type(screen.getByLabelText('Concepto'), 'Nómina');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(insertado()).toBeDefined());
    expect(insertado()).toMatchObject({
      tipo: 'ingreso',
      importe: '1258.00',
      cuenta_id: ID.ing,
      cuenta_destino_id: null,
      categoria_id: ID.nomina,
      metodo: null,
    });
  });

  it('traspaso: rechaza la misma cuenta y envía origen y destino', async () => {
    responderCon([], respuestaInsert);
    renderRuta('/movimientos/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Traspaso' }));
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Método de pago/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Importe'), '100');
    await userEvent.type(screen.getByLabelText('Concepto'), 'Ahorro');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Elige una cuenta.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Hacia (otra cuenta tuya, distinta)'), ID.efectivo);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(insertado()).toBeDefined());
    expect(insertado()).toMatchObject({
      tipo: 'traspaso',
      importe: '100.00',
      cuenta_id: ID.caixa,
      cuenta_destino_id: ID.efectivo,
      categoria_id: null,
      metodo: null,
    });
  });

  it('ajuste por saldo real: la diferencia la calcula SQL, se enseña antes de guardar y exige la nota', async () => {
    responderCon([], (l) => {
      if (l.tabla === 'rpc:calcular_ajuste') {
        return { data: [{ saldo_app: '100.00', saldo_real: '103.12', diferencia: '3.12', sentido: 'suma' }], error: null };
      }
      if (l.tabla === 'rpc:crear_ajuste') return { data: [{ id: 'nuevo', diferencia: '3.12' }], error: null };
      return undefined;
    });
    renderRuta(`/movimientos/nuevo?tipo=ajuste&cuenta=${ID.ing}`);

    expect(await screen.findByRole('radio', { name: 'Ajuste' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Cuenta a corregir')).toHaveValue(ID.ing);
    expect(screen.getByRole('note')).toHaveTextContent('No cuenta en el balance');

    const saldo = screen.getByLabelText('¿Cuánto tienes ahora en Banco Dos?');
    expect(saldo).toHaveFocus();
    await userEvent.type(saldo, '103,12');
    expect(await screen.findByText(conTexto('Se creará un ajuste de +3,12 €'))).toBeInTheDocument();
    const calculo = db().llamadas.find((l) => l.tabla === 'rpc:calcular_ajuste');
    expect(paso(calculo, 'rpc')?.[1]).toEqual({ p_cuenta: ID.ing, p_saldo_real: '103.12' });

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Un ajuste necesita una nota que explique el descuadre.')).toBeInTheDocument();
    expect(db().llamadas.some((l) => l.tabla === 'rpc:crear_ajuste')).toBe(false);

    await userEvent.type(screen.getByLabelText(/Nota \(obligatoria\)/), 'Diferencia con el extracto');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(db().llamadas.some((l) => l.tabla === 'rpc:crear_ajuste')).toBe(true));
    const creado = db().llamadas.find((l) => l.tabla === 'rpc:crear_ajuste');
    expect(paso(creado, 'rpc')?.[1]).toEqual({
      p_cuenta: ID.ing,
      p_saldo_real: '103.12',
      p_nota: 'Diferencia con el extracto',
      p_concepto: 'Ajuste de saldo',
    });
    // El importe nunca lo manda la web: no hay insert directo en movimientos
    expect(llamadasMovimientos('insert')).toHaveLength(0);
  });

  it('ajuste: si el saldo cuadra no se guarda nada; un descubierto se envía con signo', async () => {
    responderCon([], (l) =>
      l.tabla === 'rpc:calcular_ajuste'
        ? { data: [{ saldo_app: '-20.00', saldo_real: '-20.00', diferencia: '0.00', sentido: null }], error: null }
        : undefined,
    );
    renderRuta(`/movimientos/nuevo?tipo=ajuste&cuenta=${ID.caixa}`);
    await userEvent.type(await screen.findByLabelText('¿Cuánto tienes ahora en Banco Uno?'), '-20');
    expect(await screen.findByText('El saldo cuadra: no hace falta ningún ajuste.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    const calculo = db().llamadas.find((l) => l.tabla === 'rpc:calcular_ajuste');
    expect(paso(calculo, 'rpc')?.[1]).toEqual({ p_cuenta: ID.caixa, p_saldo_real: '-20.00' });
  });

  it('devolución: «Gasto original» primero (de SQL); al elegirlo rellena categoría, cuenta y lo pendiente; «-24» se guarda como 24.00', async () => {
    responderCon([], (l) => {
      if (l.tabla === 'rpc:gastos_devolvibles') {
        return {
          data: [
            {
              id: ID.mov2,
              fecha: '2026-10-12',
              concepto: 'Entradas',
              importe: '100.00',
              pendiente: '85.00',
              categoria_id: ID.ocio,
              cuenta_id: ID.ing,
            },
          ],
          error: null,
        };
      }
      if (l.tabla === 'movimientos' && operacion(l) === 'insert') return { data: { id: 'nuevo' }, error: null };
      return undefined;
    });
    renderRuta('/movimientos/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Devolución' }));
    const original = screen.getByLabelText(/Gasto original/);
    // El gasto original va antes que el importe
    expect(original.compareDocumentPosition(screen.getByLabelText('Importe')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(within(original).getByRole('option', { name: /Entradas/ })).toBeInTheDocument());
    expect(within(original).getByRole('option', { name: /Entradas/ }).textContent?.replace(/\s/g, ' ')).toBe(
      '12 oct · Entradas · 100,00 € (quedan 85,00 €)',
    );
    await userEvent.selectOptions(original, ID.mov2);
    expect(screen.getByLabelText('Importe')).toHaveValue('85,00');
    expect(screen.getByRole('radio', { name: /^Ocio/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Entra en')).toHaveValue(ID.ing);

    await userEvent.clear(screen.getByLabelText('Importe'));
    await userEvent.type(screen.getByLabelText('Importe'), '-24');
    await userEvent.type(screen.getByLabelText('Concepto'), 'Bizum entrada');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(insertado()).toBeDefined());
    expect(insertado()).toMatchObject({
      tipo: 'devolucion',
      importe: '24.00',
      categoria_id: ID.ocio,
      devolucion_de: ID.mov2,
      cuenta_id: ID.ing,
    });
  });

  it('orden: Importe → Concepto → Categoría → Cuenta → Método → Fecha → Notas; el importe recibe el foco', async () => {
    responderCon([]);
    renderRuta('/movimientos/nuevo');
    const importe = await screen.findByLabelText('Importe');
    await waitFor(() => expect(importe).toHaveFocus());
    expect(importe).toHaveAttribute('inputmode', 'decimal');
    const campos = [
      importe,
      screen.getByLabelText('Concepto'),
      screen.getByRole('radiogroup', { name: 'Categoría' }),
      screen.getByLabelText('Sale de'),
      screen.getByLabelText('Método de pago'),
      screen.getByLabelText('Fecha en que ocurrió'),
      screen.getByLabelText(/^Notas/),
    ];
    for (let i = 1; i < campos.length; i++) {
      const anterior = campos[i - 1] as HTMLElement;
      expect(anterior.compareDocumentPosition(campos[i] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('valida al salir del campo, no antes de escribir', async () => {
    responderCon([]);
    renderRuta('/movimientos/nuevo');
    const importe = await screen.findByLabelText('Importe');
    expect(screen.queryByText('Introduce un importe mayor que 0.')).not.toBeInTheDocument();
    await userEvent.type(importe, '0');
    expect(screen.queryByText('Introduce un importe mayor que 0.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Concepto'));
    expect(await screen.findByText('Introduce un importe mayor que 0.')).toBeInTheDocument();
  });

  it('categorías: las más usadas primero (SQL) y sugerencia por el concepto', async () => {
    responderCon([], (l) => {
      if (l.tabla === 'rpc:categorias_mas_usadas') {
        return { data: [{ categoria_id: ID.restaurantes }, { categoria_id: ID.ocio }], error: null };
      }
      if (l.tabla === 'rpc:sugerir_categoria') return { data: ID.ocio, error: null };
      return undefined;
    });
    renderRuta('/movimientos/nuevo');
    const grupo = await screen.findByRole('radiogroup', { name: 'Categoría' });
    await waitFor(() =>
      expect(within(grupo).getAllByRole('radio').map((r) => r.textContent)).toEqual([
        expect.stringContaining('Restaurantes'),
        expect.stringContaining('Ocio'),
      ]),
    );
    await userEvent.type(screen.getByLabelText('Concepto'), 'Cine Yelmo');
    await waitFor(() => expect(within(grupo).getByRole('radio', { name: /^Ocio/ })).toHaveAttribute('aria-checked', 'true'));
    expect(within(grupo).getByRole('radio', { name: /^Ocio/ })).toHaveTextContent('Sugerida');
    const sugerencia = db().llamadas.find((l) => l.tabla === 'rpc:sugerir_categoria');
    expect(paso(sugerencia, 'rpc')?.[1]).toEqual({ p_concepto: 'Cine Yelmo', p_tipo: 'gasto' });
  });

  it('chips «Hoy» y «Ayer» junto a la fecha', async () => {
    responderCon([]);
    renderRuta('/movimientos/nuevo');
    const fecha = await screen.findByLabelText('Fecha en que ocurrió');
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Ayer' }));
    expect(fecha).toHaveValue('2026-10-19');
    expect(screen.getByRole('button', { name: 'Ayer' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('traspaso: cada cuenta muestra su saldo de hoy (v_saldos)', async () => {
    responderCon([], (l) =>
      l.tabla === 'v_saldos' ? { data: [{ id: ID.caixa, valor: '98.32' }], error: null } : undefined,
    );
    renderRuta('/movimientos/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Traspaso' }));
    const desde = screen.getByLabelText('Desde');
    await waitFor(() =>
      expect(
        within(desde)
          .getAllByRole('option')
          .map((o) => o.textContent?.replace(/\s/g, ' ')),
      ).toContain('Banco Uno · 98,32 €'),
    );
  });

  it('un error de la base se traduce y nunca se enseña el mensaje crudo', async () => {
    responderCon([], (l) =>
      l.tabla === 'movimientos' && operacion(l) === 'insert'
        ? {
            data: null,
            error: { code: '23514', message: 'La cuenta Banco Uno está cerrada: reábrela para cambiar sus datos' },
          }
        : undefined,
    );
    renderRuta('/movimientos/nuevo');
    await userEvent.type(await screen.findByLabelText('Importe'), '10');
    await elegirCategoria('Ocio');
    await userEvent.type(screen.getByLabelText('Concepto'), 'Algo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Una de las cuentas está cerrada. Reábrela en Configuración para cambiar sus movimientos.',
    );
    expect(screen.queryByText(/reábrela para cambiar sus datos/)).not.toBeInTheDocument();
  });

  it('editar: carga el movimiento y actualiza con el importe como texto', async () => {
    const m = movimiento({ id: ID.mov2, concepto: 'Cena', importe: '38.50', categoria_id: ID.restaurantes, fecha: '2026-10-12' });
    responderCon([m], (l) => {
      if (l.tabla !== 'movimientos') return undefined;
      if (operacion(l) === 'update') return { data: [{ id: ID.mov2 }], error: null };
      if (paso(l, 'eq')?.[1] === 'devolucion_de') return { data: [], error: null };
      return undefined;
    });
    renderRuta(`/movimientos/${ID.mov2}/editar`);

    const importe = await screen.findByLabelText('Importe');
    expect(importe).toHaveValue('38,50');
    await userEvent.clear(importe);
    await userEvent.type(importe, '40');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(llamadasMovimientos('update')).toHaveLength(1));
    const update = llamadasMovimientos('update')[0];
    expect(paso(update, 'update')?.[1]).toMatchObject({ importe: '40.00', fecha: '2026-10-12', tipo: 'gasto' });
    expect(paso(update, 'update')?.[1]).not.toHaveProperty('origen');
    expect(pasos(update, 'eq')).toEqual([['eq', 'id', ID.mov2]]);
  });
});
