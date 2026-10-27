import { useT } from '@/shared/i18n';
import { SegmentedControl } from '@/shared/ui';
import type { OrdenFilas } from '../lib/agregaciones';

/** «Ordenar por: Importe | Diferencia» para las listas «este mes vs el anterior». */
export function OrdenFilasControl({ valor, onChange }: { valor: OrdenFilas; onChange: (orden: OrdenFilas) => void }) {
  const t = useT('estadisticas');
  return (
    <SegmentedControl<OrdenFilas>
      etiqueta={t('orden.etiqueta')}
      tamano="sm"
      valor={valor}
      onChange={onChange}
      opciones={[
        { valor: 'importe', etiqueta: t('orden.importe') },
        { valor: 'variacion', etiqueta: t('orden.variacion') },
      ]}
    />
  );
}
