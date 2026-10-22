import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { guardarLocal, leerLocal } from '@/shared/lib/almacenamiento';
import { I18nContext, type ValorI18n } from './contexto';
import { IDIOMA_RESPALDO, LOCALE_DE, esIdioma, type Idioma } from './tipos';

export const CLAVE_IDIOMA = 'kapital.idioma';

/** Idioma inicial: el guardado en el dispositivo, si no el del navegador, si no español. */
export function idiomaInicial(): Idioma {
  const guardado = leerLocal(CLAVE_IDIOMA);
  if (esIdioma(guardado)) return guardado;
  const navegador = typeof navigator === 'undefined' ? '' : navigator.language.slice(0, 2).toLowerCase();
  return esIdioma(navegador) ? navegador : IDIOMA_RESPALDO;
}

interface Props {
  children: ReactNode;
  /** Solo para tests. */
  idioma?: Idioma;
}

export function I18nProvider({ children, idioma: forzado }: Props) {
  const [idioma, setEstado] = useState<Idioma>(() => forzado ?? idiomaInicial());

  const setIdioma = useCallback((nuevo: Idioma) => {
    setEstado(nuevo);
    guardarLocal(CLAVE_IDIOMA, nuevo);
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const valor = useMemo<ValorI18n>(() => ({ idioma, locale: LOCALE_DE[idioma], setIdioma }), [idioma, setIdioma]);

  return <I18nContext value={valor}>{children}</I18nContext>;
}
