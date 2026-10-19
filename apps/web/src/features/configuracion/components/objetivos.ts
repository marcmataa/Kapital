import type { Categoria, Objetivo } from '@/shared/api/catalogos';
import type { FuncionT } from '@/shared/i18n';

function nombreCategoria(o: Objetivo, categorias: readonly Categoria[], t: FuncionT<'configuracion'>): string {
  return categorias.find((c) => c.id === o.categoria_id)?.nombre ?? t('objetivos.categoriaDesconocida');
}

/** «Ahorro mensual» / «Límite de Ocio». */
export function etiquetaObjetivo(o: Objetivo, categorias: readonly Categoria[], t: FuncionT<'configuracion'>): string {
  return o.tipo === 'ahorro_mensual'
    ? t('objetivos.ahorro')
    : t('objetivos.limite', { categoria: nombreCategoria(o, categorias, t) });
}

/** «Ahorro 500,00 €/mes» / «Ocio < 300,00 €» (importe ya formateado). */
export function resumenObjetivo(
  o: Objetivo,
  importe: string,
  categorias: readonly Categoria[],
  t: FuncionT<'configuracion'>,
): string {
  return o.tipo === 'ahorro_mensual'
    ? t('objetivos.resumenAhorro', { importe })
    : t('objetivos.resumenLimite', { categoria: nombreCategoria(o, categorias, t), importe });
}
