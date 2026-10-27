import type { ReactNode } from 'react';
import { Undo2 } from 'lucide-react';
import { Card } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { aCentimos, formatearEuros, type OpcionesEuros } from '@/shared/lib/dinero';
import { partesDe, sumarMeses } from '@/shared/lib/fechas';
import type { Comparativa, RitmoGasto } from '../api/estadisticasApi';
import { mesDesde, nombreMes } from '../lib/formato';
import type { PeriodosComparacion } from '../lib/periodos';
import { LineaVariacion } from './LineaVariacion';

interface Props {
  periodos: PeriodosComparacion;
  datos: Comparativa;
  /**
   * gastos: gastos netos, gasto medio diario (vs el mes anterior), proyección a fin de mes y
   * devoluciones del mes. ingresos: solo la tarjeta de ingresos.
   */
  modo: 'gastos' | 'ingresos';
  /** Ritmo de gasto (ritmo_gasto, SQL). Solo en modo gastos; mientras carga, no se muestra. */
  ritmo?: RitmoGasto | undefined;
}

/**
 * Título de una comparativa (sección 8, misma longitud): mes en curso → «… al día D»; mes cerrado
 * → «… septiembre completo». Sin mes anterior con datos no hay comparación: «Categorías de
 * septiembre» (nunca «vs agosto» sin datos de agosto).
 */
export function useTituloComparativa(periodos: PeriodosComparacion, clave: 'comparativa.titulo' | 'desglose.titulo' | 'categorias.titulo') {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  if (periodos.anterior === null) return t(`${clave}.sinAnterior`, { mes: mesDesde(periodos.actual.desde, locale) });
  return periodos.enCurso
    ? t(`${clave}.alDia`, { dia: String(partesDe(periodos.actual.hasta).dia) })
    : t(`${clave}.completo`, { mes: nombreMes(sumarMeses(periodos.actual.desde, -1), locale) });
}

/**
 * «vs +382,00 € el mes pasado»: solo el importe anterior (el actual ya es la cifra grande de
 * encima) y sin porcentaje (el % va aparte, en `LineaVariacion`). null si no hay periodo
 * anterior (sección 8).
 */
export function useLineaVs() {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  return (anterior: string | null, opciones: OpcionesEuros = {}) =>
    anterior === null
      ? null
      : t('comparativa.vs', { anterior: formatearEuros(anterior, locale, opciones) });
}

function Tarjeta({ etiqueta, valor, children, testId }: { etiqueta: string; valor: string; children: ReactNode; testId?: string }) {
  return (
    <article data-testid={testId} className="flex min-w-0 flex-col gap-1 rounded-xl bg-superficie-2 p-3 sm:p-3.5">
      <h3 className="text-sm text-apagado">{etiqueta}</h3>
      <p className="cifras truncate text-xl font-bold tracking-tight text-texto sm:text-2xl">{valor}</p>
      {children}
    </article>
  );
}

/**
 * Comparativa del tramo con el mismo tramo del mes anterior. Importes, variaciones, gasto medio
 * diario, mayor gasto (comparativa_estadisticas), devoluciones y proyección (ritmo_gasto) vienen
 * de SQL. Color por significado: que suban los gastos es rojo; que suban los ingresos, verde.
 */
export function ComparativaMes({ periodos, datos, modo, ritmo }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const titulo = useTituloComparativa(periodos, 'comparativa.titulo');
  const lineaVs = useLineaVs();
  const euros = (v: string) => formatearEuros(v, locale);
  const gastos = modo === 'gastos';
  const actual = gastos ? datos.gastos_netos : datos.ingresos;
  const anterior = gastos ? datos.gastos_netos_anterior : datos.ingresos_anterior;
  const variacion = gastos ? datos.variacion_gastos : datos.variacion_ingresos;
  const mayor =
    datos.mayor_concepto !== null && datos.mayor_importe !== null
      ? t('comparativa.mayor', { concepto: datos.mayor_concepto, importe: euros(datos.mayor_importe) })
      : t('comparativa.sinMayor');
  const vs = lineaVs(anterior);
  const devoluciones = ritmo !== undefined && aCentimos(ritmo.devoluciones) > 0n ? ritmo.devoluciones : null;
  const medioAnterior = ritmo?.gasto_medio_diario_anterior ?? null;
  const proyeccion = ritmo?.proyeccion_fin_mes ?? null;
  // Con tramos de la misma longitud, (a/d − b/d) / (b/d) = (a − b) / b: el % del gasto medio diario
  // repetiría el de Gastos. Solo se muestra si los días difieren (31 de octubre contra 30 de septiembre).
  const mismosDias = periodos.anterior !== null && partesDe(periodos.anterior.hasta).dia === datos.dias;

  return (
    <Card titulo={titulo}>
      <div className={gastos ? 'grid grid-cols-2 gap-2.5 sm:gap-3' : 'grid grid-cols-1'} data-testid={`comparativa-${modo}`}>
        <Tarjeta etiqueta={t(gastos ? 'comparativa.gastos' : 'comparativa.ingresos')} valor={euros(actual)}>
          {vs !== null && <p className="cifras text-[13px] text-apagado sm:text-sm">{vs}</p>}
          <LineaVariacion actual={actual} anterior={anterior} porcentaje={variacion} subirEsBueno={!gastos} />
        </Tarjeta>
        {gastos && (
          <Tarjeta etiqueta={t('comparativa.medioDiario')} valor={euros(datos.gasto_medio_diario)}>
            {medioAnterior !== null && (
              <p data-testid="medio-diario-anterior" className="cifras text-[13px] text-apagado sm:text-sm">
                {t('comparativa.medioDiarioVs', { importe: euros(medioAnterior) })}
              </p>
            )}
            {ritmo !== undefined && medioAnterior !== null && !mismosDias && (
              <LineaVariacion
                actual={ritmo.gasto_medio_diario}
                anterior={medioAnterior}
                porcentaje={ritmo.variacion_medio_diario}
                subirEsBueno={false}
              />
            )}
            <p className="text-[13px] text-apagado sm:text-sm">{t('comparativa.dias', { dias: String(datos.dias) })}</p>
            {/* Concepto largo: hasta dos líneas y el texto completo en el title, nunca «Ave Madrid Champio…». */}
            <p data-testid="mayor-gasto" title={mayor} className="line-clamp-2 min-w-0 text-xs break-words text-apagado sm:text-sm">
              {mayor}
            </p>
          </Tarjeta>
        )}
        {gastos && ritmo !== undefined && proyeccion !== null && (
          <div className="col-span-2">
            <Tarjeta testId="proyeccion-fin-mes" etiqueta={t('comparativa.proyeccion')} valor={euros(proyeccion)}>
              <p className="text-[13px] text-apagado sm:text-sm">
                {t('comparativa.proyeccionNota', { dias: String(ritmo.dias_mes) })}
              </p>
            </Tarjeta>
          </div>
        )}
      </div>
      {gastos && devoluciones !== null && (
        <p data-testid="devoluciones-mes" className="mt-3 flex items-center gap-1.5 text-sm text-positivo">
          <Undo2 aria-hidden="true" className="size-4 shrink-0" />
          <span className="cifras">
            {periodos.enCurso
              ? t('comparativa.devoluciones', { importe: euros(devoluciones) })
              : t('comparativa.devolucionesMes', {
                  importe: euros(devoluciones),
                  mes: nombreMes(periodos.actual.desde, locale),
                })}
          </span>
        </p>
      )}
    </Card>
  );
}
