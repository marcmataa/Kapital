import type { ClaveDe, FuncionT } from '@/shared/i18n';

/*
 * Nombre visible de una categoría.
 *
 * Las categorías por defecto (las del onboarding) llevan `clave` y se muestran traducidas;
 * las que crea o renombra el usuario tienen `clave` null y se muestran tal cual las escribió.
 * `nombre` en la base sigue siendo el nombre canónico en español (lo usan el atajo y el análisis).
 * Al renombrar, la base pone la clave a null (trigger de 20261023000001_categorias_clave.sql).
 * Las 3 últimas claves las añade 20261024000000_categorias_y_cuentas_clave.sql (que añadía 7;
 * hogar, salud, cuidado_personal y regalos las quita 20261102000000_eliminar_categorias.sql).
 */

/** Mismos valores que el check `categorias_clave_valida` de la base. */
export const CLAVES_CATEGORIA = [
  'restaurantes',
  'ocio',
  'transporte',
  'suscripciones',
  'otros_gastos',
  'nomina',
  'otros_ingresos',
  'rendimientos',
  'supermercado',
  'deporte',
  'ropa',
] as const;

export type ClaveCategoria = (typeof CLAVES_CATEGORIA)[number];

const TEXTO: Record<ClaveCategoria, ClaveDe<'common'>> = {
  restaurantes: 'categoria.restaurantes',
  ocio: 'categoria.ocio',
  transporte: 'categoria.transporte',
  suscripciones: 'categoria.suscripciones',
  otros_gastos: 'categoria.otros_gastos',
  nomina: 'categoria.nomina',
  otros_ingresos: 'categoria.otros_ingresos',
  rendimientos: 'categoria.rendimientos',
  supermercado: 'categoria.supermercado',
  deporte: 'categoria.deporte',
  ropa: 'categoria.ropa',
};

export function esClaveCategoria(valor: unknown): valor is ClaveCategoria {
  return typeof valor === 'string' && (CLAVES_CATEGORIA as readonly string[]).includes(valor);
}

export interface CategoriaConNombre {
  nombre: string;
  clave?: string | null;
}

/** Nombre traducido si es una categoría por defecto; si no, el nombre del usuario tal cual. */
export function nombreCategoria(categoria: CategoriaConNombre, t: FuncionT<'common'>): string {
  return esClaveCategoria(categoria.clave) ? t(TEXTO[categoria.clave]) : categoria.nombre;
}
