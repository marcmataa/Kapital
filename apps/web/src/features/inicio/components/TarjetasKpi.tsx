import { useIdioma, useT } from '@/shared/i18n';
import {
  aCentimos,
  compararImportes,
  formatearEuros,
  formatearPorcentaje,
  variacionPorcentual,
} from '@/shared/lib/dinero';
import { formatearFecha, mismoDiaMesAnterior, partesDe } from '@/shared/lib/fechas';
import { StatCard, type Tendencia, type VariacionStat } from '@/shared/ui';
import type { ResumenPeriodo } from '../api/inicioApi';
import { mesCorto, restarImportes } from '../lib/calculos';

interface Props {
  hoy: string;
  /** Patrimonio al cierre de hoy (provisional) y del día equivalente d' del mes anterior. */
  patrimonioHoy: string | null;
  patrimonioAnterior: string | null;
  /** Resumen de 1..hoy y de 1..d' del mes anterior (sección 7). */
  resumenActual: ResumenPeriodo;
  resumenAnterior: ResumenPeriodo | null;
}

const TENDENCIA: Record<-1 | 0 | 1, Tendencia> = { [-1]: 'baja', 0: 'igual', 1: 'sube' };

/**
 * Tarjetas del mes en curso: patrimonio a hoy vs d', ingresos y gastos netos de 1..hoy vs 1..d'.
 * Color por significado (sección 8): que suban los gastos es rojo. Base 0 o sin datos →
 * «Sin datos del mes anterior». El balance no se mezcla con el patrimonio.
 */
export function TarjetasKpi({ hoy, patrimonioHoy, patrimonioAnterior, resumenActual, resumenAnterior }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const dPrima = mismoDiaMesAnterior(hoy);
  const dia = partesDe(hoy).dia;
  const vsTramo = t('kpi.vsTramo', { dia: partesDe(dPrima).dia, mes: mesCorto(dPrima, locale) });

  const variacionImporte = (
    actual: string,
    anterior: string | null,
    subirEsBueno: boolean,
  ): VariacionStat | undefined => {
    const pct = variacionPorcentual(actual, anterior);
    if (pct === null || anterior === null) return undefined;
    return {
      texto: formatearPorcentaje(pct, locale, { signo: 'siempre' }),
      tendencia: TENDENCIA[compararImportes(actual, anterior)],
      subirEsBueno,
      contexto: vsTramo,
    };
  };

  // Patrimonio: % solo si patrimonio(d') > 0 (sección 7); si no, la diferencia en euros.
  let variacionPatrimonio: VariacionStat | undefined;
  if (patrimonioHoy !== null && patrimonioAnterior !== null) {
    const tendencia = TENDENCIA[compararImportes(patrimonioHoy, patrimonioAnterior)];
    const contexto = t('kpi.vsFecha', { fecha: formatearFecha(dPrima, locale, 'corta') });
    variacionPatrimonio =
      aCentimos(patrimonioAnterior) > 0n
        ? {
            texto: formatearPorcentaje(variacionPorcentual(patrimonioHoy, patrimonioAnterior), locale, {
              signo: 'siempre',
            }),
            tendencia,
            contexto,
          }
        : {
            texto: formatearEuros(restarImportes(patrimonioHoy, patrimonioAnterior), locale, { signo: 'siempre' }),
            tendencia,
            contexto,
          };
  }

  const sinAnterior = t('kpi.sinAnterior');
  const mes = mesCorto(hoy, locale);
  const ingresos = variacionImporte(resumenActual.ingresos, resumenAnterior?.ingresos ?? null, true);
  const gastos = variacionImporte(resumenActual.gastos_netos, resumenAnterior?.gastos_netos ?? null, false);

  return (
    <section aria-label={t('kpi.region')} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        titulo={t('kpi.patrimonio', { fecha: formatearFecha(hoy, locale, 'corta') })}
        valor={patrimonioHoy !== null ? formatearEuros(patrimonioHoy, locale) : t('kpi.sinValor')}
        {...(variacionPatrimonio ? { variacion: variacionPatrimonio } : { pie: sinAnterior })}
      />
      <StatCard
        titulo={t('kpi.ingresos', { dia, mes })}
        valor={formatearEuros(resumenActual.ingresos, locale)}
        tono="positivo"
        {...(ingresos ? { variacion: ingresos } : { pie: sinAnterior })}
      />
      <StatCard
        titulo={t('kpi.gastos', { dia, mes })}
        valor={formatearEuros(resumenActual.gastos_netos, locale)}
        tono="negativo"
        {...(gastos ? { variacion: gastos } : { pie: sinAnterior })}
      />
    </section>
  );
}
