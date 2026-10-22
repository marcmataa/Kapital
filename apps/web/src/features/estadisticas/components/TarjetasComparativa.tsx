import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import type { ResumenPeriodo } from '../api/estadisticasApi';
import { formatearTramo, signo } from '../lib/formato';
import type { PeriodosComparacion } from '../lib/periodos';
import { LineaVariacion } from './LineaVariacion';
import { TarjetaCifra } from './TarjetaCifra';

interface Props {
  periodos: PeriodosComparacion;
  actual: ResumenPeriodo;
  /** null = no hay periodo anterior con datos. */
  anterior: ResumenPeriodo | null;
}

/**
 * Gastos netos, ingresos y balance del tramo seleccionado contra el mismo tramo del mes anterior
 * (sección 8: periodos de la misma longitud; color por significado).
 */
export function TarjetasComparativa({ periodos, actual, anterior }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const tramo = formatearTramo(periodos.actual, locale);
  const tramoAnterior = periodos.anterior ? formatearTramo(periodos.anterior, locale) : '';
  const contexto = (valor: string | undefined) =>
    valor === undefined ? undefined : t('comparativa.vs', { importe: formatearEuros(valor, locale), tramo: tramoAnterior });
  const sBalance = signo(actual.balance);

  const variacion = (campo: 'gastos_netos' | 'ingresos' | 'balance', subirEsBueno: boolean) => {
    const ctx = contexto(anterior?.[campo]);
    return (
      <LineaVariacion
        actual={actual[campo]}
        anterior={anterior?.[campo] ?? null}
        subirEsBueno={subirEsBueno}
        {...(ctx !== undefined && { contexto: ctx })}
      />
    );
  };

  return (
    <section aria-label={t('comparativa.titulo')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TarjetaCifra titulo={t('comparativa.gastosNetos', { tramo })} valor={formatearEuros(actual.gastos_netos, locale)}>
        {variacion('gastos_netos', false)}
      </TarjetaCifra>
      <TarjetaCifra titulo={t('comparativa.ingresos', { tramo })} valor={formatearEuros(actual.ingresos, locale)}>
        {variacion('ingresos', true)}
      </TarjetaCifra>
      <TarjetaCifra
        titulo={t('comparativa.balance', { tramo })}
        valor={formatearEuros(actual.balance, locale, { signo: 'siempre' })}
        tono={sBalance < 0 ? 'negativo' : sBalance > 0 ? 'positivo' : 'neutro'}
      >
        {variacion('balance', true)}
        <p className="text-xs text-apagado sm:text-sm">
          {t('comparativa.ahorro', { porcentaje: formatearPorcentaje(actual.ahorro_pct, locale) })}
          {periodos.enCurso && ` · ${t('comparativa.provisional')}`}
        </p>
      </TarjetaCifra>
    </section>
  );
}
