import { useMemo } from 'react';
import { useAuth } from '@/app/auth';
import { nombreUsuario, type NombreUsuario } from '@/shared/lib/usuario';

/** Nombre de pila y completo del usuario con sesión (de user_metadata). Ver `nombreUsuario`. */
export function useNombreUsuario(): NombreUsuario {
  const { usuario } = useAuth();
  const metadata = usuario?.user_metadata;
  return useMemo(() => nombreUsuario(metadata), [metadata]);
}
