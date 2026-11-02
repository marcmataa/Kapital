import { Link } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { clasesBoton } from '@/shared/ui';
import { useMovimientosPendientesRevisionQuery } from '../api/sqlApi';

/**
 * Aviso en la lista de movimientos cuando hay devoluciones pendientes de revisión (reglas,
 * sección 3). No aparece si no hay ninguna o si la consulta falla: es una ayuda, no bloquea nada.
 */
export function AvisoRevision() {
  const t = useT('movimientos');
  const { data } = useMovimientosPendientesRevisionQuery();
  const n = data?.length ?? 0;
  if (n === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-borde bg-superficie px-4 py-3 text-sm"
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-negativo" />
      <p className="min-w-0 flex-1 text-texto">{n === 1 ? t('revision.avisoUno') : t('revision.aviso', { n: String(n) })}</p>
      <Link to="/movimientos/revision" className={cx(clasesBoton('secundario'), 'area-tactil')}>
        {t('revision.revisar')}
      </Link>
    </div>
  );
}
