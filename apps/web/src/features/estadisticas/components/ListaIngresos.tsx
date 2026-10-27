import { Card, EmptyState } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import type { FilaDia } from '../lib/agregaciones';

interface Props {
  /** Filas de movimientos_por_dia del tramo (SQL). */
  dias: readonly FilaDia[];
  /** «septiembre» (es) / «de setembre» (ca), para el título. */
  mes: string;
}

/**
 * Ingresos del mes, uno por fila (fecha, concepto, importe). Los ingresos de un particular llegan
 * en pocos movimientos: una lista responde «¿cuándo y cuánto cobré?» mejor que una serie diaria
 * casi siempre a cero (auditoría F13). El total del mes está en la comparativa (SQL).
 */
export function ListaIngresos({ dias, mes }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const ingresos = dias.flatMap((d) => d.movimientos.filter((m) => m.tipo === 'ingreso').map((m) => ({ ...m, fecha: d.fecha })));
  const titulo = t('listaIngresos.titulo', { mes });

  return (
    <Card titulo={titulo}>
      {ingresos.length === 0 ? (
        <EmptyState titulo={t('ingresos.vacio')} className="py-6" />
      ) : (
        <ul aria-label={titulo} className="flex flex-col divide-y divide-borde text-sm">
          {ingresos.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex min-w-0 flex-col">
                <span className="break-words text-texto">{m.concepto}</span>
                <span className="text-xs text-apagado">{formatearFecha(m.fecha, locale, 'media')}</span>
              </span>
              <span className="cifras shrink-0 font-semibold text-positivo">{formatearEuros(m.importe, locale, { signo: 'siempre' })}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
