import { DonutCategorias, type CategoriaDonut } from '@/features/inicio/components/DonutCategorias';
import { Card, EmptyState } from '@/shared/ui';
import { useT } from '@/shared/i18n';
import { aCentimos } from '@/shared/lib/dinero';
import type { DatosAnalisis } from '../schemas/esquemas';

const COLOR_POR_DEFECTO = '#8f9bbd';

/**
 * Gasto neto por categoría del snapshot, con el mismo donut que Inicio. El donut aplica la
 * sección 8: % sobre la suma de las categorías positivas (suman 100 %) y las categorías en negativo se listan en rojo pero no
 * entran en el gráfico.
 */
export function CategoriasMes({ datos }: { datos: DatosAnalisis }) {
  const t = useT('analisis');
  // `datos.categorias` no trae id: el nombre es único por usuario y sirve de id.
  const categorias: CategoriaDonut[] = datos.categorias.map((c) => ({
    id: c.nombre,
    nombre: c.nombre,
    color: c.color ?? COLOR_POR_DEFECTO,
    gasto: c.gasto,
  }));
  const hayGasto = categorias.some((c) => aCentimos(c.gasto) !== 0n);

  return (
    <Card titulo={t('categorias.titulo')}>
      {hayGasto ? (
        <DonutCategorias
          categorias={categorias}
          totalGastoNeto={datos.resumen.gastos_netos}
          etiquetaTotal={t('categorias.etiquetaTotal')}
        />
      ) : (
        <EmptyState titulo={t('categorias.vacio')} className="py-6" />
      )}
    </Card>
  );
}
