import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface ValorAuth {
  /** true hasta que se sabe si hay sesión (evita parpadeos en los guards). */
  cargando: boolean;
  sesion: Session | null;
  usuario: User | null;
  /** true si la sesión viene de un enlace de recuperación de contraseña. */
  recuperandoPassword: boolean;
  cerrarSesion: () => Promise<void>;
}

export const AuthContext = createContext<ValorAuth | null>(null);

export function useAuth(): ValorAuth {
  const valor = useContext(AuthContext);
  if (!valor) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return valor;
}

/** Usuario con sesión. Solo dentro de rutas protegidas por <RequireAuth>. */
export function useUsuario(): User {
  const { usuario } = useAuth();
  if (!usuario) throw new Error('useUsuario requiere sesión (usar dentro de <RequireAuth>)');
  return usuario;
}
