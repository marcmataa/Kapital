import { Route, Routes } from 'react-router';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Categoria } from '@/shared/api/catalogos';
import { hoy } from '@/shared/lib/fechas';
import { renderConApp, sesionFalsa } from '@/test/render';

/* ------------------------------------------------------------------ Supabase simulado */

interface Llamada {
  tabla: string;
  op: 'select' | 'update' | 'insert' | '';
  columnas?: string;
  valores?: unknown;
  filtros: [string, unknown][];
}

type Respuesta = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  llamadas: [] as Llamada[],
  datos: {} as Record<string, unknown>,
  rpc: vi.fn(),
  /** Respuesta para escrituras (update/insert); por defecto, éxito. */
  escribir: vi.fn(),
}));

vi.mock('@/shared/lib/supabase', () => {
  const desde = (tabla: string) => {
    const reg: Llamada = { tabla, op: '', filtros: [] };
    const responder = (): Respuesta => {
      if (reg.op === 'select') return { data: db.datos[tabla] ?? [], error: null };
      return (db.escribir(reg) as Respuesta | undefined) ?? { data: null, error: null };
    };
    const b = {
      select(c: string) {
        if (reg.op === '') reg.op = 'select';
        reg.columnas = c;
        return b;
      },
      update(v: unknown) {
        reg.op = 'update';
        reg.valores = v;
        return b;
      },
      insert(v: unknown) {
        reg.op = 'insert';
        reg.valores = v;
        return b;
      },
      eq(k: string, v: unknown) {
        reg.filtros.push([k, v]);
        return b;
      },
      order: () => b,
      maybeSingle: () => b,
      then(ok: (r: Respuesta) => unknown, ko?: (e: unknown) => unknown) {
        db.llamadas.push(reg);
        return Promise.resolve(responder()).then(ok, ko);
      },
    };
    return b;
  };
  return { supabase: { from: desde, rpc: db.rpc } };
});

// Componentes de otras features: se sustituyen por dobles mínimos con la misma interfaz.
vi.mock('@/features/onboarding/components/SelectorBanco', () => ({
  SelectorBanco: (p: { excluir?: readonly string[]; onCambio: (b: unknown) => void }) => (
    <div>
      <span data-testid="excluidos">{(p.excluir ?? []).join(',')}</span>
      <button type="button" onClick={() => p.onCambio({ entidad: 'ing', nombre: 'ING', color: null })}>
        Elegir ING
      </button>
    </div>
  ),
}));
vi.mock('@/features/inicio/components/FormObjetivo', () => ({
  FormObjetivo: () => <p>Formulario de objetivo</p>,
}));

const { default: PaginaConfiguracion } = await import('./pages/PaginaConfiguracion');
const { cambiarPrincipal, COLUMNAS_TOKENS } = await import('./api/configuracionApi');
const { reordenar } = await import('./components/categorias');
const { leerSaldo } = await import('./components/SheetAnadirBanco');

/* ------------------------------------------------------------------ Datos inventados */

const USER = '00000000-0000-0000-0000-000000000001';

function cuenta(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    nombre: id,
    tipo: 'banco',
    entidad: null,
    color: '#336699',
    emoji: null,
    es_principal: false,
    orden: 1,
    fecha_inicial: '2026-10-01',
    fecha_cierre: null,
    saldo_inicial: '0.00',
    ...extra,
  };
}

function categoria(id: string, nombre: string, tipo: 'gasto' | 'ingreso', orden: number, extra: Partial<Categoria> = {}): Categoria {
  return {
    id,
    nombre,
    tipo,
    orden,
    color: '#ff8a3d',
    icono: null,
    archivada: false,
    created_at: '2026-10-01T00:00:00Z',
    user_id: USER,
    ...extra,
  };
}

function preparar({
  cuentas = [
    cuenta('caixa', { nombre: 'CaixaBank', entidad: 'caixabank', es_principal: true }),
    cuenta('otro', { nombre: 'Banco Prueba' }),
    cuenta('efectivo', { nombre: 'Efectivo', tipo: 'efectivo' }),
  ],
  saldos = [
    { id: 'caixa', valor: '1842.10' },
    { id: 'otro', valor: '0.00' },
    { id: 'efectivo', valor: '40.00' },
  ],
}: { cuentas?: unknown[]; saldos?: unknown[] } = {}) {
  db.datos = {
    perfiles: { user_id: USER, idioma: 'es', zona_horaria: 'Europe/Madrid', onboarding_completado: true },
    cuentas,
    v_saldos: saldos,
    categorias: [
      categoria('c1', 'Ocio', 'gasto', 1),
      categoria('c2', 'Transporte', 'gasto', 2),
      categoria('c3', 'Nómina', 'ingreso', 3),
      categoria('c4', 'Rendimientos', 'ingreso', 4),
      categoria('c5', 'Viejos', 'gasto', 5, { archivada: true }),
    ],
    objetivos: [{ id: 'o1', tipo: 'ahorro_mensual', categoria_id: null, importe: '500.00' }],
    tokens_api: [
      { id: 't1', nombre: 'iPhone', revocado: false, ultimo_uso: null, created_at: '2026-10-10T10:00:00Z' },
    ],
  };
}

function renderPagina() {
  return renderConApp(<PaginaConfiguracion />, { sesion: sesionFalsa(USER), ruta: '/configuracion' });
}

const escrituras = (tabla: string) => db.llamadas.filter((l) => l.tabla === tabla && l.op !== 'select');

beforeEach(() => {
  vi.clearAllMocks();
  db.escribir.mockReset();
  db.rpc.mockReset();
  db.llamadas = [];
  preparar();
});

/* ------------------------------------------------------------------ Idioma */

describe('Idioma', () => {
  it('cambia la interfaz al momento y guarda perfiles.idioma', async () => {
    renderPagina();
    await userEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    await waitFor(() => expect(escrituras('perfiles')).toHaveLength(1));
    expect(escrituras('perfiles')[0]).toMatchObject({ op: 'update', valores: { idioma: 'en' }, filtros: [['user_id', USER]] });
  });

  it('si no se guarda, vuelve al idioma anterior', async () => {
    db.escribir.mockReturnValue({ data: null, error: { code: '42501', message: 'x' } });
    renderPagina();
    await userEvent.click(screen.getByRole('radio', { name: 'Català' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Español' })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ Bancos */

describe('Mis bancos', () => {
  it('lista los bancos abiertos con su valor de hoy y el principal', async () => {
    renderPagina();
    const lista = await screen.findByRole('heading', { name: 'Mis bancos' });
    const tarjeta = lista.closest('section');
    expect(tarjeta).not.toBeNull();
    const t = within(tarjeta as HTMLElement);
    expect(t.getByText('2 de 5 bancos. El efectivo no cuenta en el límite.')).toBeInTheDocument();
    expect(t.getByText('1.842,10 €')).toBeInTheDocument();
    expect(t.getByText('Principal')).toBeInTheDocument();
    expect(t.getAllByText('Desde 01/10/2026')).toHaveLength(2);
  });

  it('añadir banco llama a crear_banco con el saldo normalizado', async () => {
    db.rpc.mockResolvedValue({ data: 'nuevo-id', error: null });
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: '+ Añadir banco' }));
    const hoja = screen.getByRole('dialog', { name: 'Añadir banco' });
    expect(within(hoja).getByTestId('excluidos')).toHaveTextContent('caixabank');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Elegir ING' }));
    await userEvent.type(within(hoja).getByLabelText('Saldo de hoy'), '1.258,5');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Añadir banco' }));
    await waitFor(() =>
      expect(db.rpc).toHaveBeenCalledWith('crear_banco', {
        p_entidad: 'ing',
        p_nombre: 'ING',
        p_color: null,
        p_saldo: '1258.50',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('el límite de la base (23514) se explica sin mostrar el mensaje técnico', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'Ya tienes 5 bancos abiertos…' } });
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: '+ Añadir banco' }));
    const hoja = screen.getByRole('dialog', { name: 'Añadir banco' });
    await userEvent.click(within(hoja).getByRole('button', { name: 'Elegir ING' }));
    await userEvent.type(within(hoja).getByLabelText('Saldo de hoy'), '0');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Añadir banco' }));
    expect(await within(hoja).findByRole('alert')).toHaveTextContent(
      'Ya tienes 5 bancos abiertos, que es el máximo. Cierra uno para añadir otro.',
    );
  });

  it('no envía sin banco ni con un saldo no válido', async () => {
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: '+ Añadir banco' }));
    const hoja = screen.getByRole('dialog', { name: 'Añadir banco' });
    await userEvent.type(within(hoja).getByLabelText('Saldo de hoy'), 'abc');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Añadir banco' }));
    expect(within(hoja).getByText('Elige un banco.')).toBeInTheDocument();
    expect(within(hoja).getByText('Escribe un importe válido, por ejemplo 1.258,50 (puede ser 0).')).toBeInTheDocument();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('con 5 bancos abiertos el alta está desactivada y se explica', async () => {
    preparar({
      cuentas: ['a', 'b', 'c', 'd', 'e'].map((id) => cuenta(id)),
      saldos: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, valor: '10.00' })),
    });
    renderPagina();
    const boton = await screen.findByRole('button', { name: '+ Añadir banco' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription(
      'Ya tienes 5 bancos abiertos, que es el máximo. Cierra uno para añadir otro.',
    );
  });

  it('solo se cierra con valor exactamente 0', async () => {
    preparar({
      cuentas: [cuenta('caixa', { nombre: 'CaixaBank', es_principal: true }), cuenta('otro', { nombre: 'Banco Prueba' })],
      saldos: [
        { id: 'caixa', valor: '0.01' },
        { id: 'otro', valor: '12.00' },
      ],
    });
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Gestionar Banco Prueba' }));
    const hoja = screen.getByRole('dialog', { name: 'Banco Prueba' });
    expect(within(hoja).getByRole('button', { name: 'Cerrar banco' })).toBeDisabled();
    expect(
      within(hoja).getByText('Para cerrarlo, su saldo debe ser 0: haz un traspaso o un ajuste.'),
    ).toBeInTheDocument();
    expect(within(hoja).getByRole('link', { name: 'Hacer un ajuste →' })).toHaveAttribute(
      'href',
      '/movimientos/nuevo?tipo=ajuste&cuenta=otro',
    );
  });

  it('con valor 0.00 se cierra con fecha de hoy y deja de ser principal', async () => {
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Gestionar Banco Prueba' }));
    const hoja = screen.getByRole('dialog', { name: 'Banco Prueba' });
    await userEvent.click(within(hoja).getByRole('button', { name: 'Cerrar banco' }));
    await userEvent.click(within(hoja).getByRole('button', { name: 'Sí, cerrar' }));
    await waitFor(() => expect(escrituras('cuentas')).toHaveLength(1));
    expect(escrituras('cuentas')[0]).toMatchObject({
      op: 'update',
      valores: { fecha_cierre: hoy('Europe/Madrid'), es_principal: false },
      filtros: [['id', 'otro']],
    });
  });

  it('el principal no se cierra si hay otros bancos abiertos', async () => {
    preparar({
      cuentas: [cuenta('caixa', { nombre: 'CaixaBank', es_principal: true }), cuenta('otro', { nombre: 'Banco Prueba' })],
      saldos: [
        { id: 'caixa', valor: '0.00' },
        { id: 'otro', valor: '5.00' },
      ],
    });
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Gestionar CaixaBank' }));
    const hoja = screen.getByRole('dialog', { name: 'CaixaBank' });
    expect(within(hoja).getByRole('button', { name: 'Cerrar banco' })).toBeDisabled();
    expect(within(hoja).getByText(/haz principal otro banco antes de cerrarlo/)).toBeInTheDocument();
  });

  it('hacer principal: una sola llamada atómica a hacer_principal, sin updates sueltos', async () => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Gestionar Banco Prueba' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hacer principal' }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('hacer_principal', { p_cuenta: 'otro' }));
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(escrituras('cuentas')).toHaveLength(0);
    expect(await screen.findByText(/Banco Prueba/)).toBeInTheDocument();
  });

  it('si la base rechaza el cambio (22023), muestra el error y no hace nada más', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'x' } });
    const r = await cambiarPrincipal('nuevo');
    expect(r).toEqual({ error: { codigo: '22023' } });
    expect(db.rpc).toHaveBeenCalledWith('hacer_principal', { p_cuenta: 'nuevo' });
    expect(db.llamadas).toHaveLength(0);
  });

  it('efectivo enlaza al ajuste de su cuenta', async () => {
    renderPagina();
    expect(await screen.findByRole('link', { name: '¿No cuadra? Hacer un ajuste →' })).toHaveAttribute(
      'href',
      '/movimientos/nuevo?tipo=ajuste&cuenta=efectivo',
    );
    expect(screen.getByText('40,00 €')).toBeInTheDocument();
  });

  it('leerSaldo admite 0 pero no signos ni textos vacíos', () => {
    expect(leerSaldo('0', 'es-ES')).toBe('0.00');
    expect(leerSaldo('1.258,5', 'es-ES')).toBe('1258.50');
    expect(leerSaldo('-5', 'es-ES')).toBeNull();
    expect(leerSaldo('', 'es-ES')).toBeNull();
    expect(leerSaldo('99999999999', 'es-ES')).toBeNull();
  });
});

/* ------------------------------------------------------------------ Categorías */

describe('Categorías', () => {
  const abrir = async () => {
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Gestionar categorías →' }));
    return screen.getByRole('dialog', { name: 'Categorías' });
  };

  it('gasto e ingreso van en listas separadas', async () => {
    const hoja = await abrir();
    const gasto = within(hoja).getByRole('list', { name: 'Gasto' });
    expect(within(gasto).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ocio', 'Transporte']);
    expect(within(hoja).queryByText('Nómina')).not.toBeInTheDocument();

    await userEvent.click(within(hoja).getByRole('radio', { name: 'Ingreso' }));
    const ingreso = within(hoja).getByRole('list', { name: 'Ingreso' });
    expect(within(ingreso).getByText('Nómina')).toBeInTheDocument();
    expect(within(hoja).queryByText('Ocio')).not.toBeInTheDocument();
  });

  it('Rendimientos no se puede archivar', async () => {
    const hoja = await abrir();
    await userEvent.click(within(hoja).getByRole('radio', { name: 'Ingreso' }));
    expect(within(hoja).getByRole('button', { name: 'Archivar Nómina' })).toBeInTheDocument();
    expect(within(hoja).queryByRole('button', { name: 'Archivar Rendimientos' })).not.toBeInTheDocument();
    expect(within(hoja).getByText(/no se puede renombrar ni archivar/)).toBeInTheDocument();
  });

  it('nombre repetido (23505) → mensaje amable', async () => {
    db.escribir.mockReturnValue({ data: null, error: { code: '23505', message: 'duplicate key value' } });
    const hoja = await abrir();
    await userEvent.click(within(hoja).getByRole('button', { name: '+ Nueva categoría' }));
    await userEvent.type(within(hoja).getByLabelText('Nombre'), '  Ocio ');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    expect(await within(hoja).findByRole('alert')).toHaveTextContent('Ya tienes una categoría con ese nombre.');
    expect(escrituras('categorias')[0]).toMatchObject({
      op: 'insert',
      valores: { nombre: 'Ocio', tipo: 'gasto', color: '#ff8a3d', icono: null, orden: 6 },
    });
    expect(screen.queryByText(/duplicate/)).not.toBeInTheDocument();
  });

  it('subir una categoría actualiza su orden', async () => {
    const hoja = await abrir();
    await userEvent.click(within(hoja).getByRole('button', { name: 'Subir Transporte' }));
    await waitFor(() => expect(escrituras('categorias')).toHaveLength(2));
    expect(escrituras('categorias').map((l) => [l.filtros[0]?.[1], l.valores])).toEqual([
      ['c2', { orden: 1 }],
      ['c1', { orden: 2 }],
    ]);
  });

  it('reordenar reutiliza los huecos de orden de la lista', () => {
    const lista = [categoria('a', 'A', 'ingreso', 6), categoria('b', 'B', 'ingreso', 7), categoria('c', 'C', 'ingreso', 8)];
    expect(reordenar(lista, 2, -1)).toEqual([
      { id: 'c', orden: 7 },
      { id: 'b', orden: 8 },
    ]);
    expect(reordenar(lista, 0, -1)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ Objetivos */

describe('Objetivos', () => {
  it('resume los objetivos y edita el importe sin parseFloat', async () => {
    renderPagina();
    expect(await screen.findByText('Ahorro 500,00 €/mes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar objetivos →' }));
    const hoja = screen.getByRole('dialog', { name: 'Objetivos' });
    await userEvent.click(within(hoja).getByRole('button', { name: 'Cambiar importe de Ahorro mensual' }));
    const campo = within(hoja).getByLabelText('Importe');
    await userEvent.clear(campo);
    await userEvent.type(campo, '650,5');
    await userEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(escrituras('objetivos')).toHaveLength(1));
    expect(escrituras('objetivos')[0]).toMatchObject({ valores: { importe: '650.50' }, filtros: [['id', 'o1']] });
  });

  it('«Quitar» desactiva el objetivo', async () => {
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar objetivos →' }));
    const hoja = screen.getByRole('dialog', { name: 'Objetivos' });
    await userEvent.click(within(hoja).getByRole('button', { name: 'Quitar Ahorro mensual' }));
    await userEvent.click(within(hoja).getByRole('button', { name: 'Sí, quitar' }));
    await waitFor(() => expect(escrituras('objetivos')).toHaveLength(1));
    expect(escrituras('objetivos')[0]).toMatchObject({ valores: { activo: false }, filtros: [['id', 'o1']] });
  });
});

/* ------------------------------------------------------------------ Atajo */

describe('Atajo del iPhone', () => {
  it('la lista de tokens nunca pide token_hash', async () => {
    renderPagina();
    expect(await screen.findByText('iPhone')).toBeInTheDocument();
    const select = db.llamadas.find((l) => l.tabla === 'tokens_api' && l.op === 'select');
    expect(select?.columnas).toBe('id, nombre, revocado, ultimo_uso, created_at');
    expect(COLUMNAS_TOKENS).not.toContain('token_hash');
  });

  it('el token creado se muestra una vez y se borra al cerrar', async () => {
    const TOKEN = 'mf_token_de_prueba_inventado';
    db.rpc.mockResolvedValue({ data: TOKEN, error: null });
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear token' }));
    const form = screen.getByRole('dialog', { name: 'Crear token' });
    await userEvent.clear(within(form).getByLabelText('Nombre del dispositivo'));
    await userEvent.type(within(form).getByLabelText('Nombre del dispositivo'), 'iPad');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear token' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Tu token' });
    expect(db.rpc).toHaveBeenCalledWith('crear_token', { p_nombre: 'iPad' });
    expect(within(dialogo).getByText(TOKEN)).toBeInTheDocument();
    expect(within(dialogo).getByText(/no se puede volver a mostrar/)).toBeInTheDocument();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ya lo he copiado' }));
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Crear token' }));
    expect(screen.getByRole('dialog', { name: 'Crear token' })).toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
  });

  it('copia el token al portapapeles', async () => {
    const usuario = userEvent.setup();
    const TOKEN = 'mf_otro_token_inventado';
    db.rpc.mockResolvedValue({ data: TOKEN, error: null });
    renderPagina();
    await usuario.click(await screen.findByRole('button', { name: 'Crear token' }));
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear token' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Tu token' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Copiar token' }));
    expect(await within(dialogo).findByText('Copiado')).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe(TOKEN);
  });

  it('revocar pide confirmación y solo cambia `revocado`', async () => {
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Revocar iPhone' }));
    const dialogo = screen.getByRole('dialog', { name: 'Revocar token' });
    expect(escrituras('tokens_api')).toHaveLength(0);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, revocar' }));
    await waitFor(() => expect(escrituras('tokens_api')).toHaveLength(1));
    expect(escrituras('tokens_api')[0]).toMatchObject({ valores: { revocado: true }, filtros: [['id', 't1']] });
  });
});

/* ------------------------------------------------------------------ Apariencia y cuenta */

describe('Apariencia y cuenta', () => {
  it('cambia el tema de este dispositivo', async () => {
    renderPagina();
    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await userEvent.click(screen.getByRole('radio', { name: 'Automático' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('muestra el proveedor y cierra sesión', async () => {
    const cerrarSesion = vi.fn(() => Promise.resolve());
    const sesion = sesionFalsa(USER);
    sesion.user.email = 'ana@ejemplo.com';
    sesion.user.app_metadata = { provider: 'google' };
    sesion.user.user_metadata = { full_name: 'Ana Inventada' };
    renderConApp(<PaginaConfiguracion />, { sesion, auth: { cerrarSesion } });
    expect(screen.getByText('Ana Inventada')).toBeInTheDocument();
    expect(screen.getByText('ana@ejemplo.com · Google')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(cerrarSesion).toHaveBeenCalledOnce();
  });

  it('cerrar sesión desde Configuración (móvil) deja la app en /login', async () => {
    const cerrarSesion = vi.fn(() => Promise.resolve());
    renderConApp(
      <Routes>
        <Route path="/login" element={<h1>Pantalla de login</h1>} />
        <Route path="*" element={<PaginaConfiguracion />} />
      </Routes>,
      { sesion: sesionFalsa(USER), auth: { cerrarSesion }, ruta: '/configuracion' },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Pantalla de login' })).toBeInTheDocument();
  });
});
