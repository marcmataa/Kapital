import { z } from 'zod';
import { supabase } from '@/shared/lib/supabase';
import { api, aErrorApi } from './api';

/**
 * Perfil del usuario (compartido por guards, onboarding y configuración).
 * Se valida con zod: `idioma` es text en la base y aquí se acota a los idiomas de la interfaz.
 */
const esquemaPerfil = z.object({
  user_id: z.string(),
  idioma: z.enum(['es', 'en', 'ca']),
  zona_horaria: z.string(),
  onboarding_completado: z.boolean(),
});

export type Perfil = z.infer<typeof esquemaPerfil>;

export const perfilApi = api.injectEndpoints({
  endpoints: (b) => ({
    /** Perfil del usuario con sesión; null si aún no existe la fila. El argumento es su user_id (clave de caché). */
    obtenerPerfil: b.query<Perfil | null, string>({
      queryFn: async (userId) => {
        try {
          const { data, error } = await supabase.from('perfiles').select('*').eq('user_id', userId).maybeSingle();
          if (error) return { error: aErrorApi(error) };
          if (data === null) return { data: null };
          const perfil = esquemaPerfil.safeParse(data);
          return perfil.success ? { data: perfil.data } : { error: { codigo: 'perfil_invalido' } };
        } catch (e) {
          return { error: aErrorApi(e) };
        }
      },
      providesTags: ['Perfil'],
    }),
  }),
});

export const { useObtenerPerfilQuery } = perfilApi;
