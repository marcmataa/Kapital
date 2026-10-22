import { skipToken } from '@reduxjs/toolkit/query';
import { useAuth } from '@/app/auth';
import { useObtenerPerfilQuery } from '@/app/perfilApi';
import { hoy, ZONA_POR_DEFECTO } from '@/shared/lib/fechas';

/**
 * Hoy ('YYYY-MM-DD') y la zona horaria del usuario (perfiles.zona_horaria, Europe/Madrid
 * por defecto, que es también el valor mientras el perfil carga).
 */
export function useHoyUsuario(): { hoy: string; zona: string } {
  const { usuario } = useAuth();
  const { data: perfil } = useObtenerPerfilQuery(usuario?.id ?? skipToken);
  const zona = perfil?.zona_horaria ?? ZONA_POR_DEFECTO;
  return { hoy: hoy(zona), zona };
}
