import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase';
import { api } from '../api';
import { AuthContext, type ValorAuth } from './contexto';

/**
 * Sesión de Supabase Auth. supabase-js la guarda en el almacenamiento del navegador y la
 * refresca sola (autoRefreshToken). Al cerrar sesión se vacía la caché de RTK Query.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recuperandoPassword, setRecuperando] = useState(false);

  useEffect(() => {
    let activo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!activo) return;
        setSesion(data.session);
        setCargando(false);
      })
      .catch(() => {
        if (activo) setCargando(false);
      });

    // No se llama a supabase dentro de este callback (lo desaconseja supabase-js).
    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      if (!activo) return;
      setSesion(nueva);
      setCargando(false);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
      if (evento === 'SIGNED_OUT') {
        setRecuperando(false);
        dispatch(api.util.resetApiState());
      }
    });
    return () => {
      activo = false;
      data.subscription.unsubscribe();
    };
  }, [dispatch]);

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
    dispatch(api.util.resetApiState());
  }, [dispatch]);

  const valor = useMemo<ValorAuth>(
    () => ({ cargando, sesion, usuario: sesion?.user ?? null, recuperandoPassword, cerrarSesion }),
    [cargando, sesion, recuperandoPassword, cerrarSesion],
  );

  return <AuthContext value={valor}>{children}</AuthContext>;
}
