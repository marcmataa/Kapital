import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/app/auth';

/**
 * Cierra la sesión (AuthProvider.cerrarSesion también vacía la caché de RTK Query) y deja la
 * app en /login sin recordar la página anterior: quien entre después empieza desde Inicio.
 */
export function useCerrarSesion(): { salir: () => Promise<void>; saliendo: boolean } {
  const { cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);

  const salir = async () => {
    setSaliendo(true);
    try {
      await cerrarSesion();
      void navigate('/login', { replace: true });
    } finally {
      setSaliendo(false);
    }
  };

  return { salir, saliendo };
}
