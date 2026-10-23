import { Card, EmptyState } from '@/shared/ui';
import { useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { useT } from '@/shared/i18n';
import type { IngresoCategoria } from '../lib/agregaciones';
import { BarrasCategorias } from './BarrasCategorias';

/** Ingresos por categoría de ingreso. Las devoluciones nunca aparecen aquí. */
export function IngresosPorCategoria({ ingresos }: { ingresos: readonly IngresoCategoria[] }) {
  const t = useT('estadisticas');
  const nombreCategoria = useNombreCategoriaCatalogo();
  return (
    <Card titulo={t('ingresos.titulo')}>
      <div className="flex flex-col gap-3">
        {ingresos.length === 0 ? (
          <EmptyState titulo={t('ingresos.vacio')} className="py-6" />
        ) : (
          <BarrasCategorias
            etiqueta={t('ingresos.titulo')}
            filas={ingresos.map((i) => ({ ...i, nombre: nombreCategoria(i) }))}
          />
        )}
        <p className="text-xs text-apagado sm:text-sm">{t('ingresos.nota')}</p>
      </div>
    </Card>
  );
}
