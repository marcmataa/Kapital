import { Card } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { partesDe } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import { formatearTramo, signo } from '../lib/formato';
import type { PeriodosComparacion } from '../lib/periodos';
import { LineaVariacion } from './LineaVariacion';

interface Props {
  periodos: PeriodosComparacion;
  /** Balance del tramo y del mismo tramo del mes anterior (comparativa_estadisticas, SQL). */
  balance: string;
  balanceAnterior: string | null;
  /** Tasa de ahorro del tramo (resumen_periodo, SQL): balance / ingresos × 100; null sin ingresos. */
  ahorroPct: string | null;
}

/**
 * Cabecera de la pestaña Balance (sección 3): el balance del periodo, cuánto ha cambiado en euros
 * frente al mismo tramo del mes anterior (sección 8, cambio del 27/10/2026: el % solo si las dos
 * bases son > 0) y la tasa de ahorro, en una línea aparte para no confundirla con la variación.
 */
export function CabeceraBalance({ periodos, balance, balanceAnterior, ahorroPct }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const s = signo(balance);
  const vs =
    balanceAnterior === null
      ? undefined
      : periodos.enCurso && periodos.anterior !== null
        ? t('cabecera.vs.alDia', {
            anterior: formatearEuros(balanceAnterior, locale, { signo: 'siempre' }),
            dia: String(partesDe(periodos.anterior.hasta).dia),
          })
        : t('comparativa.vs', { anterior: formatearEuros(balanceAnterior, locale, { signo: 'siempre' }) });

  return (
    <Card as="section" aria-labelledby="cabecera-balance" data-testid="cabecera-balance">
      <div className="flex flex-col gap-1.5">
        <h2 id="cabecera-balance" className="flex flex-wrap items-baseline gap-x-2 text-sm text-apagado">
          <span className="font-semibold text-texto">{t('cabecera.titulo', { tramo: formatearTramo(periodos.actual, locale) })}</span>
          {periodos.enCurso && <span className="text-xs">{t('cabecera.provisional')}</span>}
        </h2>
        <p
          data-testid="cabecera-balance-valor"
          className={cx('cifras text-3xl font-bold tracking-tight sm:text-4xl', s < 0 ? 'text-negativo' : s > 0 ? 'text-positivo' : 'text-texto')}
        >
          {formatearEuros(balance, locale, { signo: 'siempre' })}
        </p>
        <LineaVariacion actual={balance} anterior={balanceAnterior} subirEsBueno diferencia {...(vs !== undefined && { contexto: vs })} />
        <p data-testid="tasa-ahorro" className="cifras text-[13px] text-apagado sm:text-sm">
          {ahorroPct === null
            ? t('cabecera.tasaAhorroSinIngresos')
            : t('cabecera.tasaAhorro', { porcentaje: formatearPorcentaje(ahorroPct, locale) })}
        </p>
      </div>
    </Card>
  );
}
