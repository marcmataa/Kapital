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
  it('agrupa por mes y pone el signo según el tipo', async () => {
    responderCon(LISTA);
    renderRuta('/movimientos');

    expect(await screen.findByRole('heading', { name: 'Octubre 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Septiembre 2026' })).toBeInTheDocument();
    expect(screen.getByText(conTexto('+24,00 €'))).toHaveClass('text-positivo');
    expect(screen.getByText(conTexto('-38,50 €'))).toHaveClass('text-negativo');
    expect(screen.getByText(conTexto('100,00 €'))).toHaveClass('text-apagado');
    expect(screen.getByText(conTexto('+3,12 €'))).toHaveClass('text-apagado');
    expect(screen.getByText(conTexto('+1.258,00 €'))).toHaveClass('text-positivo');
    // Meta explicativa de traspasos y ajustes
    expect(screen.getByText('10 oct · Banco Uno → Banco Dos · no cuenta en el balance')).toBeInTheDocument();
    expect(screen.getByText('3 oct · Ajuste · Banco Dos · se muestra aparte')).toBeInTheDocument();
    expect(screen.getByText('12 oct · Restaurantes · Tarjeta')).toBeInTheDocument();
    // Cada fila es un enlace al detalle
    expect(screen.getByRole('link', { name: /Cena con amigos/ })).toHaveAttribute('href', `/movimientos/${ID.mov2}`);
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
    await screen.findByRole('heading', { name: 'Octubre 2026' });

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
    await screen.findByRole('heading', { name: 'Octubre 2026' });

    expect(screen.getByRole('button', { name: 'Gastos' })).toHaveAttribute('aria-pressed', 'true');
    const consulta = llamadasMovimientos('select')[0];
    expect(pasos(consulta, 'eq')).toContainEqual(['eq', 'tipo', 'gasto']);
    expect(pasos(consulta, 'or')).toContainEqual(['or', `cuenta_id.eq.${ID.caixa},cuenta_destino_id.eq.${ID.caixa}`]);

    await userEvent.click(screen.getByRole('button', { name: 'Ingresos' }));
    expect(ubicacion()).toBe(`/movimientos?tipo=ingreso&cuenta=${ID.caixa}`);
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(ubicacion()).toBe(`/movimientos?cuenta=${ID.caixa}`);
  });

  it('el panel de filtros (hoja en móvil) escribe fechas y método en la URL', async () => {
    responderCon(LISTA);
    renderRuta('/movimientos');
    await screen.findByRole('heading', { name: 'Octubre 2026' });

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
    renderRuta('/movimientos?tipo=ajuste');
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar filtros' }));
    expect(ubicacion()).toBe('/movimientos');
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
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), ID.restaurantes);
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
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), ID.nomina);
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

  it('?tipo=ajuste&cuenta=… prepara un ajuste de esa cuenta y exige la nota', async () => {
    responderCon([], respuestaInsert);
    renderRuta(`/movimientos/nuevo?tipo=ajuste&cuenta=${ID.ing}`);

    expect(await screen.findByRole('radio', { name: 'Ajuste' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Cuenta a corregir')).toHaveValue(ID.ing);
    expect(screen.getByRole('note')).toHaveTextContent('No cuenta en el balance');

    await userEvent.type(screen.getByLabelText('Importe'), '-3,12');
    await userEvent.click(screen.getByRole('radio', { name: 'Resta' }));
    await userEvent.type(screen.getByLabelText('Concepto'), 'Cuadre');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Un ajuste necesita una nota que explique el descuadre.')).toBeInTheDocument();
    expect(llamadasMovimientos('insert')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText(/Nota \(obligatoria\)/), 'Diferencia con el extracto');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(insertado()).toBeDefined());
    expect(insertado()).toMatchObject({
      tipo: 'ajuste',
      importe: '3.12',
      sentido: 'resta',
      cuenta_id: ID.ing,
      notas: 'Diferencia con el extracto',
      categoria_id: null,
      metodo: null,
    });
  });

  it('devolución «-24» se guarda como 24.00 (sección 11) vinculada al gasto original', async () => {
    responderCon([], (l) => {
      if (l.tabla !== 'movimientos') return undefined;
      if (operacion(l) === 'insert') return { data: { id: 'nuevo' }, error: null };
      if (paso(l, 'in')) return { data: [{ id: 'otra', devolucion_de: ID.mov2, importe: '15.00' }], error: null };
      return {
        data: [{ id: ID.mov2, fecha: '2026-10-12', concepto: 'Entradas', importe: '100.00' }],
        error: null,
      };
    });
    renderRuta('/movimientos/nuevo');
    await userEvent.click(await screen.findByRole('radio', { name: 'Devolución' }));
    await userEvent.type(screen.getByLabelText('Importe'), '-24');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), ID.ocio);
    const original = screen.getByLabelText(/Gasto original/);
    await waitFor(() => expect(within(original).getByRole('option', { name: /Entradas/ })).toBeInTheDocument());
    expect(within(original).getByRole('option', { name: /Entradas/ }).textContent?.replace(/\s/g, ' ')).toBe(
      '12 oct · Entradas · 100,00 € (quedan 85,00 €)',
    );
    await userEvent.selectOptions(original, ID.mov2);
    await userEvent.type(screen.getByLabelText('Concepto'), 'Bizum entrada');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(insertado()).toBeDefined());
    expect(insertado()).toMatchObject({
      tipo: 'devolucion',
      importe: '24.00',
      categoria_id: ID.ocio,
      devolucion_de: ID.mov2,
      cuenta_id: ID.caixa,
    });
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
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), ID.ocio);
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
