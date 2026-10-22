import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { render, type RenderResult } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type ValorAuth } from '@/app/auth/contexto';
import { crearStore } from '@/app/store';
import { I18nProvider, type Idioma } from '@/shared/i18n';

export interface OpcionesRender {
  /** Ruta inicial del MemoryRouter. */
  ruta?: string;
  idioma?: Idioma;
  /** Sesión simulada (por defecto, sin sesión). */
  sesion?: Session | null;
  auth?: Partial<ValorAuth>;
}

/** Sesión falsa para tests. */
export function sesionFalsa(userId = '00000000-0000-0000-0000-000000000001'): Session {
  return {
    access_token: 'token-de-prueba',
    refresh_token: 'refresh-de-prueba',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  };
}

export function valorAuth(sesion: Session | null, extra: Partial<ValorAuth> = {}): ValorAuth {
  return {
    cargando: false,
    sesion,
    usuario: sesion?.user ?? null,
    recuperandoPassword: false,
    cerrarSesion: () => Promise.resolve(),
    ...extra,
  };
}

/** Proveedores de la app (store nuevo, i18n, auth simulada) sin router. */
export function Proveedores({ children, idioma = 'es', sesion = null, auth }: OpcionesRender & { children: ReactNode }) {
  return (
    <Provider store={crearStore()}>
      <I18nProvider idioma={idioma}>
        <AuthContext value={valorAuth(sesion, auth)}>{children}</AuthContext>
      </I18nProvider>
    </Provider>
  );
}

/** Renderiza con todos los proveedores y un MemoryRouter. */
export function renderConApp(ui: ReactElement, opciones: OpcionesRender = {}): RenderResult {
  const { ruta = '/', ...resto } = opciones;
  return render(
    <Proveedores {...resto}>
      <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
    </Proveedores>,
  );
}
