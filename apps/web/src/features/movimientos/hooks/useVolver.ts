import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Vuelve a la pantalla anterior si la hay dentro de la app; si se entró directamente
 * (enlace, recarga), va a `respaldo`.
 */
export function useVolver(respaldo: string): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key !== 'default') void navigate(-1);
    else void navigate(respaldo, { replace: true });
  }, [key, navigate, respaldo]);
}
