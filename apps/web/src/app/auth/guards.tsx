import { Suspense, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useIdioma, useT } from '@/shared/i18n';
import { Button, EmptyState, PantallaCarga } from '@/shared/ui';
import { useObtenerPerfilQuery } from '../perfilApi';
import { useAuth, useUsuario } from './contexto';

export interface EstadoNavegacion {
  desde?: string;
}

/** Outlet con Suspense para las páginas lazy. */
export function OutletConCarga() {
  return (
    <Suspense fallback={<PantallaCarga />}>
      <Outlet />
    </Suspense>
  );
}

/** Solo con sesión. Sin sesión → /login (recordando a dónde se quería ir). */
export function RequireAuth() {
  const { cargando, sesion } = useAuth();
  const location = useLocation();
  if (cargando) return <PantallaCarga />;
  if (!sesion) {
    const estado: EstadoNavegacion = { desde: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={estado} />;
  }
  return <OutletConCarga />;
}

/** Solo sin sesión (login, registro, recuperar). Con sesión → a donde iba o a /. */
export function PublicOnly() {
  const { cargando, sesion } = useAuth();
  const location = useLocation();
  if (cargando) return <PantallaCarga />;
  if (sesion) {
    const desde = (location.state as EstadoNavegacion | null)?.desde;
    const destino = typeof desde === 'string' && desde.startsWith('/') && !desde.startsWith('//') ? desde : '/';
    return <Navigate to={destino} replace />;
  }
  return <OutletConCarga />;
}

interface PropsOnboarding {
  /** 'completado': la app (si falta → /bienvenida). 'pendiente': /bienvenida (si ya está → /). */
  requiere: 'completado' | 'pendiente';
}

/** Lee perfiles.onboarding_completado. Debe ir dentro de <RequireAuth>. */
export function RequireOnboarding({ requiere }: PropsOnboarding) {
  const usuario = useUsuario();
  const t = useT('common');
  const { setIdioma } = useIdioma();
  const { data: perfil, isLoading, isError, refetch } = useObtenerPerfilQuery(usuario.id);

  const completado = perfil?.onboarding_completado === true;
  const idiomaPerfil = completado ? perfil.idioma : null;

  // Tras el onboarding, el idioma guardado en el perfil manda sobre el del dispositivo.
  useEffect(() => {
    if (idiomaPerfil) setIdioma(idiomaPerfil);
  }, [idiomaPerfil, setIdioma]);

  if (isLoading) return <PantallaCarga />;
  if (isError) {
    return (
      <EmptyState
        titulo={t('error.generico')}
        accion={
          <Button variante="secundario" onClick={() => void refetch()}>
            {t('accion.reintentar')}
          </Button>
        }
      />
    );
  }
  if (requiere === 'completado' && !completado) return <Navigate to="/bienvenida" replace />;
  if (requiere === 'pendiente' && completado) return <Navigate to="/" replace />;
  return <OutletConCarga />;
}
