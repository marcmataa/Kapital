import { LOCALE_DE, useIdioma } from '@/shared/i18n';

/** Locale BCP 47 del idioma de la interfaz (para Intl). */
export function useLocale(): string {
  const { idioma } = useIdioma();
  return LOCALE_DE[idioma];
}
