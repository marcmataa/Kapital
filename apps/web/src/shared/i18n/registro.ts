/**
 * Registro de namespaces. Está pre-poblado con TODAS las features: cada una solo edita
 * sus propios ficheros `src/features/<feature>/i18n/{es,en,ca}.ts` y nunca este.
 * es.ts define las claves; en.ts y ca.ts deben tener exactamente las mismas (lo comprueba
 * `satisfies Traduccion<typeof es>` en compilación y registro.test.ts en los tests).
 */
import analisisCa from '@/features/analisis/i18n/ca';
import analisisEn from '@/features/analisis/i18n/en';
import analisisEs from '@/features/analisis/i18n/es';
import authCa from '@/features/auth/i18n/ca';
import authEn from '@/features/auth/i18n/en';
import authEs from '@/features/auth/i18n/es';
import configuracionCa from '@/features/configuracion/i18n/ca';
import configuracionEn from '@/features/configuracion/i18n/en';
import configuracionEs from '@/features/configuracion/i18n/es';
import estadisticasCa from '@/features/estadisticas/i18n/ca';
import estadisticasEn from '@/features/estadisticas/i18n/en';
import estadisticasEs from '@/features/estadisticas/i18n/es';
import inicioCa from '@/features/inicio/i18n/ca';
import inicioEn from '@/features/inicio/i18n/en';
import inicioEs from '@/features/inicio/i18n/es';
import movimientosCa from '@/features/movimientos/i18n/ca';
import movimientosEn from '@/features/movimientos/i18n/en';
import movimientosEs from '@/features/movimientos/i18n/es';
import onboardingCa from '@/features/onboarding/i18n/ca';
import onboardingEn from '@/features/onboarding/i18n/en';
import onboardingEs from '@/features/onboarding/i18n/es';
import commonCa from './common/ca';
import commonEn from './common/en';
import commonEs from './common/es';
import type { Idioma, Mensajes } from './tipos';

export const recursos = {
  common: { es: commonEs, en: commonEn, ca: commonCa },
  auth: { es: authEs, en: authEn, ca: authCa },
  onboarding: { es: onboardingEs, en: onboardingEn, ca: onboardingCa },
  inicio: { es: inicioEs, en: inicioEn, ca: inicioCa },
  movimientos: { es: movimientosEs, en: movimientosEn, ca: movimientosCa },
  estadisticas: { es: estadisticasEs, en: estadisticasEn, ca: estadisticasCa },
  analisis: { es: analisisEs, en: analisisEn, ca: analisisCa },
  configuracion: { es: configuracionEs, en: configuracionEn, ca: configuracionCa },
} as const satisfies Record<string, Record<Idioma, Mensajes>>;

export type Namespace = keyof typeof recursos;
export type ClaveDe<N extends Namespace> = keyof (typeof recursos)[N]['es'] & string;
