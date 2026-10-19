import { skipToken } from '@reduxjs/toolkit/query';
import { useAuth } from '@/app/auth';
import { useObtenerPerfilQuery } from '@/app/perfilApi';
import { hoy, ZONA_POR_DEFECTO } from '@/shared/lib/fechas';

/** Hoy ('YYYY-MM-DD') en la zona horaria del perfil (Europe/Madrid por defecto). */
export function useHoyUsuario(): string {
  const { usuario } = useAuth();
  const perfil = useObtenerPerfilQuery(usuario?.id ?? skipToken);
  return hoy(perfil.data?.zona_horaria ?? ZONA_POR_DEFECTO);
}
