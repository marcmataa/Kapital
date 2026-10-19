import { useUsuario } from '@/app/auth';
import { useObtenerPerfilQuery } from '@/app/perfilApi';
import { hoy, ZONA_POR_DEFECTO } from '@/shared/lib/fechas';

/** Hoy ('YYYY-MM-DD') y la zona horaria del usuario (perfiles.zona_horaria, Europe/Madrid por defecto). */
export function useHoyUsuario(): { hoy: string; zona: string } {
  const usuario = useUsuario();
  const { data: perfil } = useObtenerPerfilQuery(usuario.id);
  const zona = perfil?.zona_horaria ?? ZONA_POR_DEFECTO;
  return { hoy: hoy(zona), zona };
}
