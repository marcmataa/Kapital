import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros, formatearPorcentaje, variacionImporte, variacionPorcentual } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { signo, signoPorcentaje } from '../lib/formato';

interface Props {
  actual: string;
  /** Valor del periodo anterior; null = no existe ese periodo. */
  anterior: string | null;
  /** ¿Subir es bueno? Ingresos y balance sí; gastos no (sección 8: color por significado). */
  subirEsBueno: boolean;
  /** Contexto ya formateado: «vs 1.037,40 € (1–19 sept)». */
  contexto?: string;
  /** Variación ya calculada en SQL (4+ decimales); si se pasa, no se calcula aquí. null = sin base. */
  porcentaje?: string | null;
  /**
   * Medida que puede ser ≤ 0 (el balance): la diferencia en euros siempre y el % solo si las dos
   * bases son > 0 (sección 8, cambio del 27/10/2026). Ignora `porcentaje`.
   */
  diferencia?: boolean;
}

const FLECHA = { 1: ArrowUp, [-1]: ArrowDown, 0: Minus } as const;

/**
 * «↓ −7,3 % vs …»; con `diferencia`, «↓ −447,45 € vs …» (y «(+48,0 %)» si ambas bases son > 0).
 * «Sin datos del mes anterior» si no hay periodo anterior o, en modo %, si la base es 0.
 */
export function LineaVariacion({ actual, anterior, subirEsBueno, contexto, porcentaje, diferencia = false }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const variacion = diferencia && anterior !== null ? variacionImporte(actual, anterior) : null;
  const pct = variacion !== null ? variacion.porcentaje : porcentaje !== undefined ? porcentaje : variacionPorcentual(actual, anterior);
  if (variacion === null && pct === null) {
    return <p className="text-xs text-apagado sm:text-sm">{t('comparativa.sinDatosAnterior')}</p>;
  }
  const s = variacion !== null ? signo(variacion.diferencia) : signoPorcentaje(pct ?? '0');
  const Flecha = FLECHA[s];
  const color = s === 0 ? 'text-apagado' : (s > 0) === subirEsBueno ? 'text-positivo' : 'text-negativo';
  return (
    <p data-testid="linea-variacion" className="flex flex-wrap items-center gap-1 text-xs text-apagado sm:text-sm">
      <span className={cx('inline-flex items-center gap-0.5 font-semibold', color)}>
        <Flecha aria-hidden="true" className="size-3.5" />
        <span className="cifras">
          {variacion !== null
            ? formatearEuros(variacion.diferencia, locale, { signo: 'siempre' })
            : formatearPorcentaje(pct, locale, { signo: 'siempre' })}
        </span>
        {variacion !== null && pct !== null && (
          <span className="cifras font-normal">({formatearPorcentaje(pct, locale, { signo: 'siempre' })})</span>
        )}
      </span>
      {contexto !== undefined && <span>{contexto}</span>}
    </p>
  );
}
