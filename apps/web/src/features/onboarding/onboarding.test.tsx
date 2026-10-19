import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import { SelectorBanco, type BancoElegido } from './components/SelectorBanco';
import PaginaBienvenida from './pages/PaginaBienvenida';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));

vi.mock('@/shared/lib/supabase', () => {
  // Perfil: from('perfiles').select('*').eq(...).maybeSingle() → aún sin fila.
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return { supabase: { rpc: mocks.rpc, from: () => consulta } };
});

vi.mock('react-hot-toast', () => ({ default: mocks.toast }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

function renderOnboarding() {
  return renderConApp(
    <Routes>
      <Route path="/bienvenida" element={<PaginaBienvenida />} />
      <Route path="/" element={<p>Pantalla de inicio</p>} />
    </Routes>,
    { ruta: '/bienvenida', sesion: sesionFalsa() },
  );
}

/** Texto con espacios normales (Intl usa espacios no separables antes de «€»). */
const plano = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

const titulo = () => screen.getByRole('heading', { level: 2 });

async function siguiente(u: UserEvent) {
  await u.click(screen.getByRole('button', { name: 'Siguiente' }));
}

/** Pasos 1–3: español, banco principal y su saldo. */
async function hastaOtrosBancos(u: UserEvent, banco = 'CaixaBank', saldo = '1.258,50') {
  await siguiente(u);
  await u.click(screen.getByRole('button', { name: banco }));
  await siguiente(u);
  await u.type(screen.getByLabelText('Saldo actual'), saldo);
  await siguiente(u);
  expect(titulo()).toHaveTextContent('¿Usas otro banco?');
}

describe('Onboarding', { timeout: 30_000 }, () => {
  it('flujo completo: llama UNA vez a completar_onboarding con todo y vuelve al inicio', async () => {
    const u = userEvent.setup();
    renderOnboarding();

    expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Español' })).toHaveAttribute('aria-checked', 'true');
    await siguiente(u);

    // El foco va al título del nuevo paso.
    expect(titulo()).toHaveTextContent('¿Cuál es tu banco principal?');
    expect(titulo()).toHaveFocus();
    expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument();
    const caixa = screen.getByRole('button', { name: 'CaixaBank' });
    await u.click(caixa);
    expect(caixa).toHaveAttribute('aria-pressed', 'true');
    await siguiente(u);

    expect(titulo()).toHaveTextContent('¿Cuánto tienes hoy en CaixaBank?');
    await u.type(screen.getByLabelText('Saldo actual'), '1.258,50');
    await siguiente(u);

    // Paso 4: BBVA con «Añadir otro» y un banco propio confirmado con «Siguiente».
    expect(screen.queryByRole('button', { name: 'CaixaBank' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'BBVA' }));
    await u.type(screen.getByLabelText('Saldo en BBVA'), '300');
    await u.click(screen.getByRole('button', { name: 'Añadir otro' }));
    expect(
      within(screen.getByRole('region', { name: 'Bancos que has añadido' })).getByText('BBVA'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'BBVA' })).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Otro banco' }));
    const nombre = screen.getByLabelText('Nombre del banco');
    expect(nombre).toHaveFocus();
    await u.type(nombre, 'Caja Rural');
    await u.click(screen.getByRole('radio', { name: 'Morado' }));
    await u.type(screen.getByLabelText('Saldo en Caja Rural'), '0');
    await siguiente(u);

    expect(titulo()).toHaveTextContent('¿Cuánto llevas en efectivo?');
    const efectivo = screen.getByLabelText('Efectivo');
    expect(efectivo).toHaveValue('0');
    await u.clear(efectivo);
    await u.type(efectivo, '40');
    await siguiente(u);

    expect(titulo()).toHaveTextContent('Todo listo');
    expect(screen.getByText('Resumen')).toBeInTheDocument();
    expect(plano(screen.getByTestId('patrimonio'))).toMatch(/^Patrimonio a \d{2}\/\d{2}\/\d{4}1\.598,50 €$/);
    expect(mocks.rpc).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('completar_onboarding', {
      p_idioma: 'es',
      p_bancos: [
        {
          entidad: 'caixabank',
          nombre: 'CaixaBank',
          color: null,
          saldo: '1258.50',
        },
        { entidad: 'bbva', nombre: 'BBVA', color: null, saldo: '300.00' },
        {
          entidad: null,
          nombre: 'Caja Rural',
          color: '#7c3aed',
          saldo: '0.00',
        },
      ],
      p_efectivo: '40.00',
    });
  });

  it('el idioma cambia la interfaz al momento y se envía', async () => {
    const u = userEvent.setup();
    renderOnboarding();
    await u.click(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(titulo()).toHaveTextContent('Which language do you want to use Kapital in?');
    await u.click(screen.getByRole('button', { name: 'Next' }));
    expect(titulo()).toHaveTextContent('What is your main bank?');
  });

  it('se puede saltar el segundo banco', async () => {
    const u = userEvent.setup();
    renderOnboarding();
    await hastaOtrosBancos(u, 'BBVA', '0');
    await u.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(titulo()).toHaveTextContent('¿Cuánto llevas en efectivo?');
    await siguiente(u);
    expect(plano(screen.getByTestId('patrimonio'))).toMatch(/0,00 €$/);
    await u.click(screen.getByRole('button', { name: 'Empezar' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith('completar_onboarding', {
      p_idioma: 'es',
      p_bancos: [{ entidad: 'bbva', nombre: 'BBVA', color: null, saldo: '0.00' }],
      p_efectivo: '0.00',
    });
  });

  it('máximo 5 bancos en total', async () => {
    const u = userEvent.setup();
    renderOnboarding();
    await hastaOtrosBancos(u);
    for (const banco of ['BBVA', 'ING', 'Revolut']) {
      await u.click(screen.getByRole('button', { name: banco }));
      await u.type(screen.getByLabelText(`Saldo en ${banco}`), '10');
      await u.click(screen.getByRole('button', { name: 'Añadir otro' }));
    }
    // El quinto banco ya no ofrece «Añadir otro»: se confirma con «Siguiente».
    await u.click(screen.getByRole('button', { name: 'Openbank' }));
    await u.type(screen.getByLabelText('Saldo en Openbank'), '10');
    expect(screen.queryByRole('button', { name: 'Añadir otro' })).not.toBeInTheDocument();
    await siguiente(u);
    await u.click(screen.getByRole('button', { name: 'Atrás' }));

    expect(screen.getByRole('status')).toHaveTextContent('Ya tienes 5 bancos, que es el máximo.');
    expect(screen.queryByRole('group', { name: 'Bancos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saltar' })).not.toBeInTheDocument();

    // Quitar uno vuelve a mostrar la rejilla.
    await u.click(screen.getByRole('button', { name: 'Quitar ING' }));
    expect(screen.getByRole('group', { name: 'Bancos' })).toBeInTheDocument();
  });

  it('un saldo no válido bloquea «Siguiente» y explica el error', async () => {
    const u = userEvent.setup();
    renderOnboarding();
    await siguiente(u);
    await siguiente(u);
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige tu banco principal.');
    await u.click(screen.getByRole('button', { name: 'Santander' }));
    await siguiente(u);

    const campo = screen.getByLabelText('Saldo actual');
    await siguiente(u);
    expect(titulo()).toHaveTextContent('¿Cuánto tienes hoy en Santander?');
    expect(screen.getByText('Escribe el saldo. Si no tienes nada, pon 0.')).toBeInTheDocument();

    await u.type(campo, '-24');
    await siguiente(u);
    expect(titulo()).toHaveTextContent('¿Cuánto tienes hoy en Santander?');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveFocus();
    expect(screen.getByText('Escribe un importe positivo, por ejemplo 1.258,50.')).toBeInTheDocument();

    await u.clear(campo);
    await u.type(campo, '12abc');
    await siguiente(u);
    expect(titulo()).toHaveTextContent('¿Cuánto tienes hoy en Santander?');

    await u.clear(campo);
    await u.type(campo, '0');
    await siguiente(u);
    expect(titulo()).toHaveTextContent('¿Usas otro banco?');
  });

  it('P0001 (ya completado) → aviso y al inicio, sin mostrar el mensaje de la base', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'El onboarding ya está completado' },
    });
    const u = userEvent.setup();
    renderOnboarding();
    await hastaOtrosBancos(u);
    await siguiente(u);
    await siguiente(u);
    await u.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith('Ya habías terminado la configuración. Te llevamos a tu inicio.');
  });

  it('23505 (nombre repetido) → mensaje amable y se puede reintentar', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'Ya tienes una cuenta llamada «X»' },
    });
    const u = userEvent.setup();
    renderOnboarding();
    await hastaOtrosBancos(u);
    await siguiente(u);
    await siguiente(u);
    await u.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hay dos cuentas con el mismo nombre. Cambia el nombre de uno de tus bancos.',
    );
    expect(screen.queryByText(/Ya tienes una cuenta llamada/)).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByText('Pantalla de inicio')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('error de red → mensaje de conexión', async () => {
    mocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const u = userEvent.setup();
    renderOnboarding();
    await hastaOtrosBancos(u);
    await siguiente(u);
    await siguiente(u);
    await u.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión.');
  });
});

describe('SelectorBanco', () => {
  function renderSelector(props: { excluir?: ('bbva' | 'ing')[]; nombresOcupados?: string[] } = {}) {
    const onCambio = vi.fn<(b: BancoElegido | null) => void>();
    renderConApp(<SelectorBanco valor={null} onCambio={onCambio} {...props} />);
    return onCambio;
  }

  it('muestra los 10 bancos del catálogo más «Otro banco» y respeta «excluir»', () => {
    renderSelector({ excluir: ['bbva'] });
    const grupo = screen.getByRole('group', { name: 'Bancos' });
    expect(within(grupo).getAllByRole('button')).toHaveLength(10);
    expect(within(grupo).queryByRole('button', { name: 'BBVA' })).not.toBeInTheDocument();
    expect(within(grupo).getByRole('button', { name: 'Otro banco' })).toBeInTheDocument();
  });

  it('elegir un banco del catálogo emite entidad + nombre', async () => {
    const onCambio = renderSelector();
    await userEvent.click(screen.getByRole('button', { name: 'Trade Republic' }));
    expect(onCambio).toHaveBeenLastCalledWith({
      entidad: 'trade_republic',
      nombre: 'Trade Republic',
      color: null,
    });
  });

  it('«Otro banco»: exige nombre no repetido (sin mayúsculas) y emite nombre + color', async () => {
    const onCambio = renderSelector({ nombresOcupados: ['Caja Rural'] });
    await userEvent.click(screen.getByRole('button', { name: 'Otro banco' }));
    expect(onCambio).toHaveBeenLastCalledWith(null);
    const nombre = screen.getByLabelText('Nombre del banco');
    await userEvent.type(nombre, 'caja rural');
    expect(screen.getByText('Ya tienes una cuenta con ese nombre.')).toBeInTheDocument();
    expect(onCambio).toHaveBeenLastCalledWith(null);

    await userEvent.clear(nombre);
    await userEvent.type(nombre, '  Abanca ');
    expect(onCambio).toHaveBeenLastCalledWith({
      entidad: null,
      nombre: 'Abanca',
      color: '#15803d',
    });

    // Colores con flechas (radiogroup).
    const verde = screen.getByRole('radio', { name: 'Verde' });
    verde.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Azul' })).toHaveAttribute('aria-checked', 'true');
    expect(onCambio).toHaveBeenLastCalledWith({
      entidad: null,
      nombre: 'Abanca',
      color: '#2563eb',
    });

    await userEvent.clear(nombre);
    await userEvent.tab();
    expect(screen.getByText('Escribe el nombre del banco.')).toBeInTheDocument();
  });
});
