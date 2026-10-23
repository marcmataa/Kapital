import type { Categoria, Objetivo } from '@/shared/api/catalogos';
import type { FuncionT } from '@/shared/i18n';

/** Nombre visible de una categoría (`useNombreCategoria`): traducido si es de las por defecto. */
type NombreDe = (categoria: Categoria) => string;

function nombreCategoria(
  o: Objetivo,
  categorias: readonly Categoria[],
  t: FuncionT<'configuracion'>,
  nombreDe: NombreDe,
): string {
  const categoria = categorias.find((c) => c.id === o.categoria_id);
  return categoria ? nombreDe(categoria) : t('objetivos.categoriaDesconocida');
}

/** «Ahorro mensual» / «Límite de Ocio». */
export function etiquetaObjetivo(
  o: Objetivo,
  categorias: readonly Categoria[],
  t: FuncionT<'configuracion'>,
  nombreDe: NombreDe,
): string {
  return o.tipo === 'ahorro_mensual'
    ? t('objetivos.ahorro')
    : t('objetivos.limite', { categoria: nombreCategoria(o, categorias, t, nombreDe) });
}

/** «Ahorro 500,00 €/mes» / «Ocio < 300,00 €» (importe ya formateado). */
export function resumenObjetivo(
  o: Objetivo,
  importe: string,
  categorias: readonly Categoria[],
  t: FuncionT<'configuracion'>,
  nombreDe: NombreDe,
): string {
  return o.tipo === 'ahorro_mensual'
    ? t('objetivos.resumenAhorro', { importe })
    : t('objetivos.resumenLimite', { categoria: nombreCategoria(o, categorias, t, nombreDe), importe });
}
