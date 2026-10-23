import { useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useListarCuentasQuery } from '@/shared/api/catalogos';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { finDeMes, inicioDeMes } from '@/shared/lib/fechas';
import { SegmentedControl, Select } from '@/shared/ui';
import {
  useEstadisticasComparativaQuery,
  useEstadisticasFueraDelBalanceQuery,
  useEstadisticasGastoPorCategoriaQuery,
  useEstadisticasGastoPorMetodoQuery,
  useEstadisticasIngresosPorCategoriaQuery,
  useEstadisticasMovimientosPorDiaQuery,
  useEstadisticasResumenMensualQuery,
  useEstadisticasResumenPeriodoQuery,
} from '../api/estadisticasApi';
import { ComparativaMes, useTituloComparativa } from '../components/ComparativaMes';
import { DesgloseBalance } from '../components/DesgloseBalance';
import { EstadoConsulta } from '../components/EstadoConsulta';
import { GastoPorCategoria } from '../components/GastoPorCategoria';
import { GraficoBalanceMeses } from '../components/GraficoBalanceMeses';
import { GraficoDiario } from '../components/GraficoDiario';
import { GraficoMeses } from '../components/GraficoMeses';
import { IngresosPorCategoria } from '../components/IngresosPorCategoria';
import { Interanual } from '../components/Interanual';
import { MetodosPago } from '../components/MetodosPago';
import { repartirIngresos, serieDiaria } from '../lib/agregaciones';
import { etiquetaMes } from '../lib/formato';
import {
  hayInteranual,
  inicioDeDatos,
  mesesDisponibles,
  periodosComparacion,
  rangoInteranual,
  ultimosMeses,
} from '../lib/periodos';

type Pestana = 'gastos' | 'ingresos' | 'balance';

const MESES_GRAFICO = 6;

/** Consulta que se puede reintentar (RTK Query). */
type Reintentable = { refetch: () => unknown; isUninitialized: boolean };

export default function PaginaEstadisticas() {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const { hoy } = useHoyUsuario();
  const mesActual = inicioDeMes(hoy);
  const [mesElegido, setMes] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('gastos');

  const cuentas = useListarCuentasQuery();
  const inicioDatos = cuentas.data ? inicioDeDatos(cuentas.data) : null;
  const meses = useMemo(() => mesesDisponibles(hoy, inicioDatos), [hoy, inicioDatos]);
  const mes = mesElegido !== null && meses.includes(mesElegido) ? mesElegido : mesActual;
  // Mes en curso: 1..D contra 1..d' del mes anterior; mes cerrado: completo contra completo.
  const periodos = periodosComparacion(mes, hoy, inicioDatos);
  const anterior = periodos.anterior;
  const tituloCategorias = useTituloComparativa(periodos, 'categorias.titulo');

  const verGastos = pestana === 'gastos';
  const verIngresos = pestana === 'ingresos';
  const verBalance = pestana === 'balance';
  const si = <T,>(condicion: boolean, arg: T) => (condicion ? arg : skipToken);

  const comparativa = useEstadisticasComparativaQuery({ actual: periodos.actual, anterior });
  const porDia = useEstadisticasMovimientosPorDiaQuery(si(verGastos || verIngresos, periodos.actual));
  const metodos = useEstadisticasGastoPorMetodoQuery(si(verGastos, periodos.actual));
  const categorias = useEstadisticasGastoPorCategoriaQuery(si(verGastos || verBalance, periodos.actual));
  const categoriasAnt = useEstadisticasGastoPorCategoriaQuery(si((verGastos || verBalance) && anterior !== null, anterior ?? periodos.actual));
  const ingresos = useEstadisticasIngresosPorCategoriaQuery(si(verIngresos || verBalance, periodos.actual));
  const ingresosAnt = useEstadisticasIngresosPorCategoriaQuery(si(verBalance && anterior !== null, anterior ?? periodos.actual));
  const fuera = useEstadisticasFueraDelBalanceQuery(si(verBalance, periodos.actual));
  const fueraAnt = useEstadisticasFueraDelBalanceQuery(si(verBalance && anterior !== null, anterior ?? periodos.actual));

  const mesesGrafico = ultimosMeses(mes, MESES_GRAFICO, inicioDatos);
  const primerMes = mesesGrafico[0];
  const resumenMensual = useEstadisticasResumenMensualQuery(
    si((verGastos || verBalance) && primerMes !== undefined, { desde: primerMes ?? mes, hasta: finDeMes(mes) }),
  );
  const filasMeses = (resumenMensual.data ?? []).filter((m) => mesesGrafico.includes(m.mes));

  const conInteranual = hayInteranual(mes, hoy, inicioDatos);
  const rangoAnio = rangoInteranual(periodos.actual, periodos.enCurso);
  const resumen = useEstadisticasResumenPeriodoQuery(si(verBalance && conInteranual, periodos.actual));
  const resumenAnio = useEstadisticasResumenPeriodoQuery(si(verBalance && conInteranual, rangoAnio));

  const reintentar = (...qs: Reintentable[]) => () => {
    for (const q of qs) if (!q.isUninitialized) void q.refetch();
  };
  /** Datos de varias consultas a la vez: undefined hasta que estén todas. */
  const todas = <T,>(datos: T, ...qs: { data?: unknown; isUninitialized: boolean }[]) =>
    qs.every((q) => q.isUninitialized || q.data !== undefined) ? datos : undefined;
  const estado = (...qs: (Reintentable & { isFetching: boolean; error?: unknown })[]) => ({
    cargando: qs.some((q) => q.isFetching),
    error: qs.find((q) => q.error !== undefined)?.error,
    reintentar: reintentar(...qs),
  });

  const nombreMes = etiquetaMes(mes, locale);
  const graficoDiario = (modo: 'gastos' | 'ingresos') => (
    <EstadoConsulta datos={porDia.data} {...estado(porDia)}>
      {(filas) => <GraficoDiario key={`${mes}-${modo}`} modo={modo} nombreMes={nombreMes} dias={serieDiaria(filas, mes, hoy)} />}
    </EstadoConsulta>
  );
  const bloqueComparativa = (modo: 'gastos' | 'ingresos') => (
    <EstadoConsulta datos={comparativa.data} {...estado(comparativa)}>
      {(c) => <ComparativaMes periodos={periodos} datos={c} modo={modo} />}
    </EstadoConsulta>
  );

  return (
    <>
      <CabeceraPagina
        titulo={t('titulo')}
        acciones={
          <Select
            label={t('selector.etiqueta')}
            etiquetaOculta
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="min-w-56"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {m === mesActual ? t('selector.enCurso', { mes: etiquetaMes(m, locale) }) : etiquetaMes(m, locale)}
              </option>
            ))}
          </Select>
        }
      />

      <div className="flex flex-col gap-4 sm:gap-5">
        <SegmentedControl<Pestana>
          etiqueta={t('pestanas.etiqueta')}
          valor={pestana}
          onChange={setPestana}
          opciones={[
            { valor: 'gastos', etiqueta: t('pestanas.gastos') },
            { valor: 'ingresos', etiqueta: t('pestanas.ingresos') },
            { valor: 'balance', etiqueta: t('pestanas.balance') },
          ]}
          className="self-start"
        />

        {verGastos && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {graficoDiario('gastos')}
              {bloqueComparativa('gastos')}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <EstadoConsulta
                datos={todas(categorias.data, categorias, categoriasAnt)}
                {...estado(categorias, categoriasAnt)}
              >
                {(cats) => (
                  <GastoPorCategoria
                    categorias={cats}
                    anteriores={anterior === null ? null : (categoriasAnt.data ?? [])}
                    titulo={tituloCategorias}
                  />
                )}
              </EstadoConsulta>
              <div className="flex flex-col gap-4">
                <EstadoConsulta datos={primerMes === undefined ? [] : resumenMensual.data} {...estado(resumenMensual)}>
                  {() => <GraficoMeses key={mes} meses={filasMeses} hoy={hoy} />}
                </EstadoConsulta>
                <EstadoConsulta datos={metodos.data} {...estado(metodos)}>
                  {(ms) => <MetodosPago metodos={ms} />}
                </EstadoConsulta>
              </div>
            </div>
          </>
        )}

        {verIngresos && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {graficoDiario('ingresos')}
              {bloqueComparativa('ingresos')}
            </div>
            <EstadoConsulta datos={ingresos.data} {...estado(ingresos)}>
              {(filas) => <IngresosPorCategoria key={mes} ingresos={repartirIngresos(filas)} />}
            </EstadoConsulta>
          </>
        )}

        {verBalance && (
          <>
            <EstadoConsulta datos={primerMes === undefined ? [] : resumenMensual.data} {...estado(resumenMensual)}>
              {() => <GraficoBalanceMeses key={mes} meses={filasMeses} hoy={hoy} />}
            </EstadoConsulta>
            <EstadoConsulta
              datos={todas(comparativa.data, comparativa, ingresos, ingresosAnt, categorias, categoriasAnt, fuera, fueraAnt)}
              {...estado(comparativa, ingresos, ingresosAnt, categorias, categoriasAnt, fuera, fueraAnt)}
            >
              {(c) => (
                <DesgloseBalance
                  periodos={periodos}
                  comparativa={c}
                  ingresos={ingresos.data ?? []}
                  ingresosAnterior={ingresosAnt.data ?? []}
                  gastos={categorias.data ?? []}
                  gastosAnterior={categoriasAnt.data ?? []}
                  fuera={fuera.data ?? []}
                  fueraAnterior={fueraAnt.data ?? []}
                />
              )}
            </EstadoConsulta>
            {conInteranual && (
              <EstadoConsulta datos={todas(resumenAnio.data, resumen, resumenAnio)} {...estado(resumen, resumenAnio)}>
                {(anio) =>
                  resumen.data ? (
                    <Interanual
                      actual={resumen.data}
                      anterior={anio}
                      rangoActual={periodos.actual}
                      rangoAnterior={rangoAnio}
                    />
                  ) : null
                }
              </EstadoConsulta>
            )}
          </>
        )}
      </div>
    </>
  );
}
