import { Card, EmptyState } from '@/shared/ui';
import { useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import type { GastoCategoria } from '../api/estadisticasApi';
import { repartirCategorias } from '../lib/agregaciones';
import { BarrasCategorias } from './BarrasCategorias';

interface Props {
  categorias: readonly GastoCategoria[];
}

/**
 * Gasto neto por categoría (sección 8). % sobre la suma de las categorías positivas (suman 100 %).
 * Las categorías en negativo se listan aparte, con su número en negativo, y no entran en el gráfico.
 */
export function GastoPorCategoria({ categorias }: Props) {
  const t = useT('estadisticas');
  const nombreCategoria = useNombreCategoriaCatalogo();
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const { positivas, negativas } = repartirCategorias(categorias);

  return (
    <Card titulo={t('categorias.titulo')}>
      {positivas.length === 0 && negativas.length === 0 ? (
        <EmptyState titulo={t('categorias.vacio')} className="py-6" />
      ) : (
        <>
          <BarrasCategorias
            etiqueta={t('categorias.titulo')}
            filas={positivas.map((c) => ({
              id: c.categoria_id,
              nombre: nombreCategoria({ id: c.categoria_id, nombre: c.nombre }),
              color: c.color,
              importe: c.gasto,
              porcentaje: c.porcentaje,
            }))}
          />
          {negativas.length > 0 && (
            <ul aria-label={t('categorias.negativasTitulo')} className="mt-3 flex flex-col gap-2 border-t border-borde pt-3 text-sm">
              {negativas.map((c) => (
                <li key={c.categoria_id} className="flex justify-between gap-3 text-apagado">
                  <span>
                    {nombreCategoria({ id: c.categoria_id, nombre: c.nombre })} <span className="text-xs">({t('categorias.negativaNota')})</span>
                  </span>
                  <span className="cifras shrink-0 text-negativo">{formatearEuros(c.gasto, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
