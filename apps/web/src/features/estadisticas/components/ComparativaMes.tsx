import type { ReactNode } from 'react';
import { Card } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import { partesDe, sumarMeses } from '@/shared/lib/fechas';
import type { Comparativa } from '../api/estadisticasApi';
import { nombreMes } from '../lib/formato';
import type { PeriodosComparacion } from '../lib/periodos';
import { LineaVariacion } from './LineaVariacion';

interface Props {
  periodos: PeriodosComparacion;
  datos: Comparativa;
  /** gastos: tarjeta de gastos netos + gasto medio diario. ingresos: solo tarjeta de ingresos. */
  modo: 'gastos' | 'ingresos';
}

/**
 * Título de una comparativa (sección 8, misma longitud): mes en curso → «… al día D»; mes cerrado
 * → «… septiembre completo».
 */
export function useTituloComparativa(periodos: PeriodosComparacion, clave: 'comparativa.titulo' | 'desglose.titulo' | 'categorias.titulo') {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  return periodos.enCurso
    ? t(`${clave}.alDia`, { dia: String(partesDe(periodos.actual.hasta).dia) })
    : t(`${clave}.completo`, { mes: nombreMes(sumarMeses(periodos.actual.desde, -1), locale) });
}

function Tarjeta({ etiqueta, valor, children }: { etiqueta: string; valor: string; children: ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col gap-1 rounded-xl bg-superficie-2 p-3.5">
      <h3 className="text-sm text-apagado">{etiqueta}</h3>
      <p className="cifras truncate text-2xl font-bold tracking-tight text-texto">{valor}</p>
      {children}
    </article>
  );
}

/**
 * Comparativa del tramo con el mismo tramo del mes anterior. Importes, variación, gasto medio
 * diario y mayor gasto vienen de SQL (comparativa_estadisticas). Color por significado: que suban
 * los gastos es rojo; que suban los ingresos, verde.
 */
export function ComparativaMes({ periodos, datos, modo }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const titulo = useTituloComparativa(periodos, 'comparativa.titulo');
  const euros = (v: string) => formatearEuros(v, locale);
  const gastos = modo === 'gastos';
  const actual = gastos ? datos.gastos_netos : datos.ingresos;
  const anterior = gastos ? datos.gastos_netos_anterior : datos.ingresos_anterior;
  const variacion = gastos ? datos.variacion_gastos : datos.variacion_ingresos;
  const mayor =
    datos.mayor_concepto !== null && datos.mayor_importe !== null
      ? t('comparativa.mayor', { concepto: datos.mayor_concepto, importe: euros(datos.mayor_importe) })
      : t('comparativa.sinMayor');

  return (
    <Card titulo={titulo}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid={`comparativa-${modo}`}>
        <Tarjeta etiqueta={t(gastos ? 'comparativa.gastos' : 'comparativa.ingresos')} valor={euros(actual)}>
          <LineaVariacion actual={actual} anterior={anterior} porcentaje={variacion} subirEsBueno={!gastos} />
          {anterior !== null && (
            <p className="cifras text-xs text-apagado sm:text-sm">{t('comparativa.antes', { importe: euros(anterior) })}</p>
          )}
        </Tarjeta>
        {gastos && (
          <Tarjeta etiqueta={t('comparativa.medioDiario')} valor={euros(datos.gasto_medio_diario)}>
            <p className="text-xs text-apagado sm:text-sm">{t('comparativa.dias', { dias: String(datos.dias) })}</p>
            {/* Concepto largo: hasta dos líneas y el texto completo en el title, nunca «Ave Madrid Champio…». */}
            <p data-testid="mayor-gasto" title={mayor} className="line-clamp-2 min-w-0 text-xs break-words text-apagado sm:text-sm">
              {mayor}
            </p>
          </Tarjeta>
        )}
      </div>
    </Card>
  );
}
