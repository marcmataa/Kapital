import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearPorcentaje, variacionPorcentual } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { signoPorcentaje } from '../lib/formato';

interface Props {
  actual: string;
  /** Valor del periodo anterior; null = no existe ese periodo. */
  anterior: string | null;
  /** ¿Subir es bueno? Ingresos y balance sí; gastos no (sección 8: color por significado). */
  subirEsBueno: boolean;
  /** Contexto ya formateado: «vs 1.037,40 € (1–19 sept)». */
  contexto?: string;
}

const FLECHA = { 1: ArrowUp, [-1]: ArrowDown, 0: Minus } as const;

/** «↓ −7,3 % vs …» o «Sin datos del mes anterior» si la base es 0 o no existe. */
export function LineaVariacion({ actual, anterior, subirEsBueno, contexto }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const pct = variacionPorcentual(actual, anterior);
  if (pct === null) return <p className="text-xs text-apagado sm:text-sm">{t('comparativa.sinDatosAnterior')}</p>;
  const s = signoPorcentaje(pct);
  const Flecha = FLECHA[s];
  const color = s === 0 ? 'text-apagado' : (s > 0) === subirEsBueno ? 'text-positivo' : 'text-negativo';
  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-apagado sm:text-sm">
      <span className={cx('inline-flex items-center gap-0.5 font-semibold', color)}>
        <Flecha aria-hidden="true" className="size-3.5" />
        <span className="cifras">{formatearPorcentaje(pct, locale, { signo: 'siempre' })}</span>
      </span>
      {contexto !== undefined && <span>{contexto}</span>}
    </p>
  );
}
