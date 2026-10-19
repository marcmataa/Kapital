import { useRouteError } from 'react-router';
import { FallbackError } from '@/shared/ui';

/** errorElement del router: errores de carga de rutas (p. ej. chunk caducado tras un deploy). */
export function FallbackRuta() {
  const error = useRouteError();
  if (error instanceof Error) console.error('[ruta]', error.name);
  return <FallbackError onReintentar={() => window.location.reload()} />;
}
