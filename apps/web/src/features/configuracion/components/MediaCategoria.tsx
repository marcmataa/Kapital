import { eurosRedondos } from '@/features/movimientos/lib/presentacion';
import type { Categoria } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { useConfigMediaCategoriaQuery } from '../api/configuracionApi';

interface Props {
  categoriaId: string;
  categorias: readonly Categoria[];
}

/**
 * «Media de Ocio: 280 €/mes» al crear un límite. La media la calcula SQL (`media_gasto_categoria`:
 * gasto neto de los últimos meses completos); aquí solo se redondea a euros para mostrarla.
 */
export function MediaCategoria({ categoriaId, categorias }: Props) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const nombreDe = useNombreCategoria();
  const { data, isLoading, isError } = useConfigMediaCategoriaQuery(categoriaId);
  const categoria = categorias.find((c) => c.id === categoriaId);
  const nombre = categoria ? nombreDe(categoria) : t('objetivos.categoriaDesconocida');

  if (isLoading || isError || data === undefined) return null;
  return (
    <p aria-live="polite" className="text-xs text-apagado">
      {data === null || data.media === null
        ? t('objetivos.sinMedia', { categoria: nombre })
        : t('objetivos.media', { categoria: nombre, importe: eurosRedondos(data.media, locale), n: data.meses })}
    </p>
  );
}
