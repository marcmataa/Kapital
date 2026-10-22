import { api, ejecutar, type ErrorApi } from '@/app/api';
import { supabase } from '@/shared/lib/supabase';
import type { PayloadOnboarding } from '../hooks/estadoOnboarding';

export const onboardingApi = api.injectEndpoints({
  endpoints: (b) => ({
    /**
     * Guarda todo el onboarding de una vez (`completar_onboarding`). Los saldos viajan como texto
     * normalizado ('1258.50') y la base los lee con `leer_saldo`: nunca pasan por float.
     */
    completarOnboarding: b.mutation<null, PayloadOnboarding>({
      queryFn: async ({ p_idioma, p_bancos, p_efectivo }) => {
        const r = await ejecutar(
          supabase.rpc('completar_onboarding', {
            p_idioma,
            p_bancos: p_bancos.map((x) => ({
              entidad: x.entidad,
              nombre: x.nombre,
              color: x.color,
              saldo: x.saldo,
            })),
            p_efectivo,
          }),
        );
        return 'error' in r ? r : { data: null };
      },
      invalidatesTags: ['Perfil', 'Cuentas', 'Categorias'],
    }),
  }),
});

export const { useCompletarOnboardingMutation } = onboardingApi;

export type ClaveErrorOnboarding =
  | 'error.yaCompletado'
  | 'error.datos'
  | 'error.nombreDuplicado'
  | 'error.limite'
  | 'error.sesion'
  | 'error.red'
  | 'error.generico';

/** Código de error de la RPC → clave de texto. Nunca se muestra el mensaje de la base. */
export function claveErrorOnboarding(error: ErrorApi | undefined): ClaveErrorOnboarding {
  switch (error?.codigo) {
    case 'P0001':
      return 'error.yaCompletado';
    case '22023':
    case '22003':
      return 'error.datos';
    case '23505':
      return 'error.nombreDuplicado';
    case '23514':
      return 'error.limite';
    case '42501':
    case 'PGRST301':
      return 'error.sesion';
    case 'red':
      return 'error.red';
    default:
      return 'error.generico';
  }
}
