import { useIdioma, useT } from '@/shared/i18n';
import {
  aCentimos,
  compararImportes,
  formatearEuros,
  formatearPorcentaje,
  variacionPorcentual,
} from '@/shared/lib/dinero';
import { finDeMes, formatearFecha, inicioDeMes, mismoDiaMesAnterior, partesDe, sumarMeses } from '@/shared/lib/fechas';
import type { Tendencia, VariacionStat } from '@/shared/ui';
import type { ResumenPeriodo } from '../api/inicioApi';
import { mesCorto, restarImportes } from '../lib/calculos';
import type { CuentaDesglose } from '../lib/desglose';
import { DesgloseCuentas } from './DesgloseCuentas';
import { KpiMes } from './KpiMes';

interface Props {
  hoy: string;
  /** Mes mostrado (día 1). Por defecto, el de hoy (mes en curso). */
  mes?: string | undefined;
  /**
   * Patrimonio al cierre de la fecha de referencia d (hoy, provisional, o el último día del mes
   * cerrado) y del día equivalente d' del mes anterior (sección 7).
   */
  patrimonioHoy: string | null;
  patrimonioAnterior: string | null;
  /** Mes en curso: 1..hoy y 1..d'. Mes cerrado: mes completo y mes anterior completo (sección 7). */
  resumenActual: ResumenPeriodo;
  resumenAnterior: ResumenPeriodo | null;
  /**
   * Cuentas con su valor (SQL) al cierre de la fecha de referencia, para el desglose bajo el
   * patrimonio (mientras cargan, o si fallan, no hay desglose).
   */
  cuentas?: readonly CuentaDesglose[] | undefined;
}

const TENDENCIA: Record<-1 | 0 | 1, Tendencia> = { [-1]: 'baja', 0: 'igual', 1: 'sube' };

/**
 * Resumen del mes: Patrimonio · Ingresos · Gastos netos · Balance.
 * - En curso: patrimonio a hoy vs d', ingresos, gastos netos y balance de 1..hoy vs 1..d'.
 * - Cerrado: patrimonio al último día vs su d', y el mes completo vs el anterior completo.
 * Móvil: UNA tarjeta, el patrimonio grande arriba (con su desglose) y debajo tres columnas.
 * Escritorio: dos tarjetas del mismo ancho que las de debajo. A un lado el patrimonio con sus
 * cuentas (lo que tienes); al otro el mes (lo que ha pasado): Ingresos, Gastos netos y, separado
 * como resultado, el Balance. La altura la marca el patrimonio. Las categorías no se repiten aquí:
 * están en el donut.
 * Color por significado (sección 8): que suban los gastos es rojo. Base 0 o sin datos →
 * «Sin datos del mes anterior». El balance (sección 3) no se mezcla con el patrimonio (sección 4);
 * su ahorro (%) viene de SQL y es «—» si los ingresos son 0.
 */
export function TarjetasKpi({
  hoy,
  mes: mesMostrado,
  patrimonioHoy,
  patrimonioAnterior,
  resumenActual,
  resumenAnterior,
  cuentas,
}: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const enCurso = mesMostrado === undefined || inicioDeMes(mesMostrado) === inicioDeMes(hoy);
  const fecha = enCurso ? hoy : finDeMes(mesMostrado);
  const dPrima = mismoDiaMesAnterior(fecha);
  const hastaAnterior = enCurso ? dPrima : finDeMes(sumarMeses(fecha, -1));
  const dia = partesDe(fecha).dia;
  const vsTramo = t('kpi.vsTramo', { dia: partesDe(hastaAnterior).dia, mes: mesCorto(hastaAnterior, locale) });

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
  const mes = mesCorto(fecha, locale);
  const ingresos = variacionImporte(resumenActual.ingresos, resumenAnterior?.ingresos ?? null, true);
  const gastos = variacionImporte(resumenActual.gastos_netos, resumenAnterior?.gastos_netos ?? null, false);
  const balance = variacionImporte(resumenActual.balance, resumenAnterior?.balance ?? null, true);
  const balanceNegativo = aCentimos(resumenActual.balance) < 0n;

  return (
    <section
      aria-label={t('kpi.region')}
      className="grid grid-cols-3 gap-x-5 gap-y-5 rounded-2xl border border-borde bg-superficie p-4 shadow-tarjeta lg:grid-cols-2 lg:gap-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
    >
      <KpiMes
        titulo={t('kpi.patrimonio', { fecha: formatearFecha(fecha, locale, 'corta') })}
        valor={patrimonioHoy !== null ? formatearEuros(patrimonioHoy, locale) : t('kpi.sinValor')}
        {...(variacionPatrimonio ? { variacion: variacionPatrimonio } : { pie: sinAnterior })}
        destacado
      >
        {cuentas !== undefined && <DesgloseCuentas cuentas={cuentas} fecha={fecha} />}
      </KpiMes>
      {/* En el móvil `contents`: sus tres cifras son columnas de la tarjeta única. En escritorio, una tarjeta. */}
      <div
        className="contents lg:flex lg:flex-col lg:justify-center lg:rounded-2xl lg:border lg:border-borde lg:bg-superficie lg:px-5 lg:py-2 lg:shadow-tarjeta"
      >
        <KpiMes
          agrupado
          titulo={t('kpi.ingresos', { dia, mes })}
          valor={formatearEuros(resumenActual.ingresos, locale)}
          {...(ingresos ? { variacion: ingresos } : { pie: sinAnterior })}
        />
        <KpiMes
          agrupado
          titulo={t('kpi.gastos', { dia, mes })}
          valor={formatearEuros(resumenActual.gastos_netos, locale)}
          {...(gastos ? { variacion: gastos } : { pie: sinAnterior })}
        />
        <KpiMes
          agrupado
          resultado
          titulo={t('kpi.balance', { dia, mes })}
          valor={formatearEuros(resumenActual.balance, locale, { signo: 'siempre' })}
          {...(balanceNegativo && { tonoValor: 'negativo' as const })}
          {...(balance ? { variacion: balance } : { pie: sinAnterior })}
        >
          <p data-testid="kpi-ahorro" className="mt-1 text-xs text-apagado">
            {t('kpi.ahorro', { porcentaje: formatearPorcentaje(resumenActual.ahorro_pct, locale) })}
          </p>
        </KpiMes>
      </div>
    </section>
  );
}
