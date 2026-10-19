import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderConApp, sesionFalsa } from '@/test/render';
import { claveErrorAuth } from './api/errores';
import PaginaLogin from './pages/PaginaLogin';
import PaginaRecuperar from './pages/PaginaRecuperar';
import PaginaRegistro from './pages/PaginaRegistro';
import PaginaRestablecer from './pages/PaginaRestablecer';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/shared/lib/supabase', () => ({ supabase: { auth } }));

const ok = { data: {}, error: null };
const PASSWORD = 'una-clave-larga-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Login', () => {
  it('valida antes de llamar a Supabase', async () => {
    renderConApp(<PaginaLogin />);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Introduce un email válido.')).toBeInTheDocument();
    expect(screen.getByText('Introduce tu contraseña.')).toBeInTheDocument();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('inicia sesión con email (normalizado) y contraseña', async () => {
    auth.signInWithPassword.mockResolvedValue(ok);
    renderConApp(<PaginaLogin />);
    await userEvent.type(screen.getByLabelText('Email'), '  Ana@Ejemplo.com ');
    await userEvent.type(screen.getByLabelText('Contraseña'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@ejemplo.com', password: PASSWORD }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra un error genérico (sin decir si el email existe)', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    renderConApp(<PaginaLogin />);
    await userEvent.type(screen.getByLabelText('Email'), 'ana@ejemplo.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
    expect(screen.queryByText(/Invalid login/)).not.toBeInTheDocument();
  });

  it('Google redirige al origen de la app', async () => {
    auth.signInWithOAuth.mockResolvedValue(ok);
    renderConApp(<PaginaLogin />);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  });

  it('enlaza a registro y recuperación', () => {
    renderConApp(<PaginaLogin />);
    expect(screen.getByRole('link', { name: 'Regístrate' })).toHaveAttribute('href', '/registro');
    expect(screen.getByRole('link', { name: '¿Has olvidado la contraseña?' })).toHaveAttribute('href', '/recuperar');
  });
});

describe('Registro', () => {
  const rellenar = async (password = PASSWORD, confirmar = password) => {
    await userEvent.type(screen.getByLabelText('Email'), 'ana@ejemplo.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), password);
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), confirmar);
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  };

  it('exige 12 caracteres y que coincidan', async () => {
    renderConApp(<PaginaRegistro />);
    await rellenar('corta', 'otra');
    expect(await screen.findByText('La contraseña debe tener al menos 12 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('tras el alta pide confirmar el email', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null });
    renderConApp(<PaginaRegistro />);
    await rellenar();
    expect(await screen.findByRole('status')).toHaveTextContent('Revisa tu correo');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ana@ejemplo.com',
      password: PASSWORD,
      options: { emailRedirectTo: window.location.origin },
    });
  });

  it('registro cerrado → mensaje amable', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', status: 500, code: 'unexpected_failure', message: 'Database error saving new user' },
    });
    renderConApp(<PaginaRegistro />);
    await rellenar();
    expect(await screen.findByRole('alert')).toHaveTextContent('El registro está cerrado de momento.');
  });
});

describe('Recuperar', () => {
  it('envía el enlace a /restablecer y muestra un mensaje neutro', async () => {
    auth.resetPasswordForEmail.mockResolvedValue(ok);
    renderConApp(<PaginaRecuperar />);
    await userEvent.type(screen.getByLabelText('Email'), 'ana@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Si existe una cuenta con ese email');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@ejemplo.com', {
      redirectTo: `${window.location.origin}/restablecer`,
    });
  });

  it('límite de envíos → aviso', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'x' },
    });
    renderConApp(<PaginaRecuperar />);
    await userEvent.type(screen.getByLabelText('Email'), 'ana@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
  });
});

describe('Restablecer', () => {
  it('sin sesión el enlace no vale', () => {
    renderConApp(<PaginaRestablecer />);
    expect(screen.getByText('El enlace ha caducado o ya se ha usado. Pide uno nuevo.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute('href', '/recuperar');
  });

  it('con sesión cambia la contraseña', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    renderConApp(<PaginaRestablecer />, { sesion: sesionFalsa(), ruta: '/restablecer' });
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), PASSWORD);
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: PASSWORD }));
  });

  it('misma contraseña → error específico', async () => {
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', status: 422, code: 'same_password', message: 'x' },
    });
    renderConApp(<PaginaRestablecer />, { sesion: sesionFalsa() });
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), PASSWORD);
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('debe ser distinta');
  });
});

describe('claveErrorAuth', () => {
  it('mapea errores sin filtrar el mensaje del proveedor', () => {
    expect(claveErrorAuth(new TypeError('Failed to fetch'), 'login')).toBe('error.red');
    expect(claveErrorAuth({ name: 'AuthRetryableFetchError' }, 'registro')).toBe('error.red');
    expect(claveErrorAuth({ code: 'email_not_confirmed' }, 'login')).toBe('error.credenciales');
    expect(claveErrorAuth({ code: 'weak_password' }, 'registro')).toBe('error.passwordDebil');
    expect(claveErrorAuth({ status: 429 }, 'login')).toBe('error.demasiadosIntentos');
    expect(claveErrorAuth({ message: 'algo raro' }, 'registro')).toBe('error.generico');
  });
});
