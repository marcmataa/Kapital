import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderConApp } from '@/test/render';
import { capturarErrorOAuth, claveErrorOAuth, descartarErrorOAuth, errorOAuthPendiente } from './api/errorOAuth';
import PaginaLogin from './pages/PaginaLogin';

vi.mock('@/shared/lib/supabase', () => ({ supabase: { auth: {} } }));

const DESCRIPCION_REAL = 'Unable to exchange external code: 4/0Ab-ejemplo';

const irA = (ruta: string) => window.history.replaceState(null, '', ruta);
const rutaActual = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

afterEach(() => {
  descartarErrorOAuth();
  irA('/');
});

describe('claveErrorOAuth', () => {
  it('sin parámetros de error no hay aviso', () => {
    expect(claveErrorOAuth({})).toBeNull();
  });

  it('un fallo cualquiera de Google da el aviso genérico', () => {
    expect(
      claveErrorOAuth({
        error: 'server_error',
        error_code: 'unexpected_failure',
        error_description: DESCRIPCION_REAL,
      }),
    ).toBe('error.google');
    expect(claveErrorOAuth({ error: 'access_denied' })).toBe('error.google');
  });

  it('el rechazo del registro restringido da el aviso de acceso', () => {
    expect(
      claveErrorOAuth({
        error: 'server_error',
        error_description: 'Database error saving new user',
      }),
    ).toBe('error.sinAcceso');
    expect(
      claveErrorOAuth({
        error: 'server_error',
        error_description: 'registro_cerrado',
      }),
    ).toBe('error.sinAcceso');
    expect(
      claveErrorOAuth({
        error: 'access_denied',
        error_code: 'signup_disabled',
      }),
    ).toBe('error.sinAcceso');
  });
});

describe('capturarErrorOAuth', () => {
  it('lee el error de la query y lo quita de la URL', () => {
    irA('/?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code&otro=1');
    capturarErrorOAuth();
    expect(errorOAuthPendiente()).toBe('error.google');
    expect(rutaActual()).toBe('/?otro=1');
  });

  it('lee el error del hash y lo quita de la URL', () => {
    irA('/#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user');
    capturarErrorOAuth();
    expect(errorOAuthPendiente()).toBe('error.sinAcceso');
    expect(rutaActual()).toBe('/');
  });

  it('no toca la URL del flujo PKCE normal (?code=)', () => {
    irA('/?code=abc123');
    capturarErrorOAuth();
    expect(errorOAuthPendiente()).toBeNull();
    expect(rutaActual()).toBe('/?code=abc123');
  });
});

describe('Login tras volver de Google con error', () => {
  it('muestra el aviso genérico sin la descripción del proveedor', async () => {
    irA(`/?error=server_error&error_code=unexpected_failure&error_description=${encodeURIComponent(DESCRIPCION_REAL)}`);
    capturarErrorOAuth();
    renderConApp(<PaginaLogin />, { ruta: '/login' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo iniciar sesión con Google. Inténtalo de nuevo.',
    );
    expect(screen.queryByText(/Unable to exchange/)).not.toBeInTheDocument();
  });

  it('muestra el aviso de acceso cuando el registro está cerrado', async () => {
    irA('/#error=server_error&error_description=Database+error+saving+new+user');
    capturarErrorOAuth();
    renderConApp(<PaginaLogin />, { ruta: '/login', idioma: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('This email does not have access to Kapital yet.');
    expect(screen.queryByText(/Database error/)).not.toBeInTheDocument();
  });

  it('en catalán', async () => {
    irA('/?error=server_error');
    capturarErrorOAuth();
    renderConApp(<PaginaLogin />, { ruta: '/login', idioma: 'ca' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "No s'ha pogut iniciar sessió amb Google. Torna-ho a provar.",
    );
  });

  it('el aviso se muestra una sola vez', () => {
    irA('/?error=server_error');
    capturarErrorOAuth();
    const { unmount } = renderConApp(<PaginaLogin />, { ruta: '/login' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    unmount();
    renderConApp(<PaginaLogin />, { ruta: '/login' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin error no hay aviso', () => {
    renderConApp(<PaginaLogin />, { ruta: '/login' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
