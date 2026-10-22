export const IDIOMAS = ['es', 'en', 'ca'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const IDIOMA_RESPALDO: Idioma = 'es';

/** Locale BCP 47 para Intl (números, monedas, fechas). */
export const LOCALE_DE: Record<Idioma, string> = {
  es: 'es-ES',
  en: 'en-GB',
  ca: 'ca-ES',
};

/** Un namespace de textos: claves planas ('login.titulo') → texto con `{variables}`. */
export type Mensajes = Readonly<Record<string, string>>;

/**
 * Tipo para en.ts / ca.ts: mismas claves que es.ts, ni una más ni una menos.
 *   export default { ... } satisfies Traduccion<typeof es>;
 */
export type Traduccion<T extends Mensajes> = { readonly [K in keyof T]: string };

export function esIdioma(valor: unknown): valor is Idioma {
  return typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor);
}
