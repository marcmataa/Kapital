import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import { formatearTramo } from '../lib/formato';
import type { PeriodosComparacion } from '../lib/periodos';
import { LineaVariacion } from './LineaVariacion';

interface Props {
  periodos: PeriodosComparacion;
  /** Total del tramo, ya sumado en SQL (resumen_periodo). */
  actual: string;
  /** El mismo total del mismo tramo del mes anterior; null = no existe ese tramo. */
  anterior: string | null;
  /** ¿Subir es bueno? Ingresos sí, gastos no (sección 8: color por significado). */
  subirEsBueno: boolean;
}

/**
 * Línea discreta bajo el título de un gráfico: «Total 1–19 oct: 1.168,28 €» y la comparación con
 * el mismo tramo del mes anterior (sección 8: misma longitud; sin % si falta o vale 0).
 */
export function TotalTramo({ periodos, actual, anterior, subirEsBueno }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const tramo = formatearTramo(periodos.actual, locale);
  const contexto =
    anterior === null || periodos.anterior === null
      ? undefined
      : t('comparativa.vs', { importe: formatearEuros(anterior, locale), tramo: formatearTramo(periodos.anterior, locale) });

  return (
    <div data-testid="total-tramo" className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="text-apagado">
        {t('total.etiqueta', { tramo })}{' '}
        <span className="cifras font-semibold text-texto">{formatearEuros(actual, locale)}</span>
        {periodos.enCurso && <span className="text-xs"> · {t('total.provisional')}</span>}
      </span>
      <LineaVariacion
        actual={actual}
        anterior={anterior}
        subirEsBueno={subirEsBueno}
        {...(contexto !== undefined && { contexto })}
      />
    </div>
  );
}
