import { createContext } from 'react';
import type { Idioma } from './tipos';

export interface ValorI18n {
  idioma: Idioma;
  /** Locale BCP 47 para Intl ('es-ES', 'en-GB', 'ca-ES'). */
  locale: string;
  /**
   * Cambia el idioma de la interfaz y lo recuerda en este dispositivo.
   * Guardarlo en `perfiles.idioma` es cosa de la feature que lo cambia (configuración, onboarding).
   */
  setIdioma: (idioma: Idioma) => void;
}

export const I18nContext = createContext<ValorI18n | null>(null);
