import { useObtenerPerfilQuery } from '@/app/perfilApi';
import { useUsuario } from '@/app/auth';
import { ZONA_POR_DEFECTO, hoy } from '@/shared/lib/fechas';

/** Zona horaria del perfil (Europe/Madrid por defecto) y el día de hoy en ella. */
export function useZonaUsuario(): { zona: string; hoy: string } {
  const usuario = useUsuario();
  const { data: perfil } = useObtenerPerfilQuery(usuario.id);
  const zona = perfil?.zona_horaria ?? ZONA_POR_DEFECTO;
  return { zona, hoy: hoy(zona) };
}
