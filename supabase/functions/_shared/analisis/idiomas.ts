// El análisis se genera en los tres idiomas de la interfaz a la vez: la web enseña el del
// idioma elegido en cada momento, sin regenerar nada al cambiarlo.
import type { ContenidoAnalisis, Idioma } from './esquemas.ts';
import { IDIOMAS } from './esquemas.ts';

/**
 * Nombres de las categorías por defecto en cada idioma. Mismos textos que traduccion_categoria
 * (SQL) y que la web (shared/i18n/common): el test de analisis-ia lo comprueba.
 */
export const NOMBRES_CATEGORIA: Record<string, Record<Idioma, string>> = {
  restaurantes: { es: 'Restaurantes', en: 'Restaurants', ca: 'Restaurants' },
  ocio: { es: 'Ocio', en: 'Leisure', ca: 'Oci' },
  transporte: { es: 'Transporte', en: 'Transport', ca: 'Transport' },
  suscripciones: { es: 'Suscripciones', en: 'Subscriptions', ca: 'Subscripcions' },
  supermercado: { es: 'Supermercado', en: 'Groceries', ca: 'Supermercat' },
  hogar: { es: 'Hogar', en: 'Home', ca: 'Llar' },
  salud: { es: 'Salud', en: 'Health', ca: 'Salut' },
  deporte: { es: 'Deporte', en: 'Sport', ca: 'Esport' },
  cuidado_personal: { es: 'Cuidado personal', en: 'Personal care', ca: 'Cura personal' },
  ropa: { es: 'Ropa', en: 'Clothing', ca: 'Roba' },
  regalos: { es: 'Regalos', en: 'Gifts', ca: 'Regals' },
  otros_gastos: { es: 'Otros gastos', en: 'Other expenses', ca: 'Altres despeses' },
  nomina: { es: 'Nómina', en: 'Salary', ca: 'Nòmina' },
  otros_ingresos: { es: 'Otros ingresos', en: 'Other income', ca: 'Altres ingressos' },
  rendimientos: { es: 'Rendimientos', en: 'Investment returns', ca: 'Rendiments' },
};

/**
 * Los datos del mes vistos en otro idioma: el campo `idioma` y la `etiqueta` de cada objeto con
 * `clave` (categorías por defecto). Las categorías del usuario conservan su nombre. No toca importes.
 */
export function datosEnIdioma(datos: unknown, idioma: Idioma): unknown {
  const localizar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(localizar);
    if (typeof v !== 'object' || v === null) return v;
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, localizar(x)]));
    const clave = o['clave'];
    if (typeof clave === 'string' && 'etiqueta' in o) {
      const nombre = NOMBRES_CATEGORIA[clave]?.[idioma];
      if (nombre !== undefined) o['etiqueta'] = nombre;
    }
    return o;
  };
  const localizado = localizar(datos);
  return typeof localizado === 'object' && localizado !== null && !Array.isArray(localizado)
    ? { ...localizado, idioma }
    : localizado;
}

/** Contenido guardado desde la versión 3: el análisis (versión 2) en cada idioma. */
export interface ContenidoMultilingue {
  version: 3;
  idiomas: Record<Idioma, ContenidoAnalisis>;
}

/** Genera el análisis en los tres idiomas (en paralelo). Si falla uno, falla todo y se reintenta. */
export async function generarEnIdiomas(
  datos: unknown,
  generar: (datos: unknown) => Promise<{ contenido: ContenidoAnalisis; modelo: string }>,
): Promise<{ contenido: ContenidoMultilingue; modelo: string }> {
  const [es, en, ca] = await Promise.all(IDIOMAS.map((i) => generar(datosEnIdioma(datos, i))));
  if (!es || !en || !ca) throw new Error('idiomas_incompletos');
  return {
    contenido: { version: 3, idiomas: { es: es.contenido, en: en.contenido, ca: ca.contenido } },
    modelo: es.modelo,
  };
}
