import { useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useListarCategoriasQuery, useListarCuentasQuery } from '@/shared/api/catalogos';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { finDeMes, inicioDeMes, sumarDias, sumarMeses } from '@/shared/lib/fechas';
import { Card, EmptyState, SegmentedControl, Select } from '@/shared/ui';
import {
  useEstadisticasGastoPorCategoriaQuery,
  useEstadisticasGastoPorMetodoQuery,
  useEstadisticasMovimientosQuery,
  useEstadisticasResumenMensualQuery,
  useEstadisticasResumenPeriodoQuery,
  useEstadisticasVariacionQuery,
} from '../api/estadisticasApi';
import { BalanceMensual } from '../components/BalanceMensual';
import { EstadoConsulta } from '../components/EstadoConsulta';
import { GastoPorCategoria } from '../components/GastoPorCategoria';
import { GraficoGastoDiario } from '../components/GraficoGastoDiario';
import { IngresosPorCategoria } from '../components/IngresosPorCategoria';
import { Interanual } from '../components/Interanual';
import { MetodosPago } from '../components/MetodosPago';
import { TarjetasComparativa } from '../components/TarjetasComparativa';
import { TarjetaVariacion } from '../components/TarjetaVariacion';
import { useHoyUsuario } from '../hooks/useHoyUsuario';
import { gastoNetoPorDia, ingresosPorCategoria } from '../lib/agregaciones';
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

const MESES_GRAFICO_BALANCE = 6;

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
  const periodos = periodosComparacion(mes, hoy, inicioDatos);

  const resumen = useEstadisticasResumenPeriodoQuery(periodos.actual);
  const resumenAnterior = useEstadisticasResumenPeriodoQuery(periodos.anterior ?? skipToken);

  const verGastos = pestana === 'gastos';
  const verIngresos = pestana === 'ingresos';
  const verBalance = pestana === 'balance';

  const movimientos = useEstadisticasMovimientosQuery(verGastos || verIngresos ? periodos.actual : skipToken);
  const categorias = useEstadisticasGastoPorCategoriaQuery(verGastos ? periodos.actual : skipToken);
  const metodos = useEstadisticasGastoPorMetodoQuery(verGastos ? periodos.actual : skipToken);
  const categoriasUsuario = useListarCategoriasQuery(verIngresos ? undefined : skipToken);

  const mesesBalance = ultimosMeses(mes, MESES_GRAFICO_BALANCE, inicioDatos);
  const primerMesBalance = mesesBalance[0];
  const resumenMensual = useEstadisticasResumenMensualQuery(
    verBalance && primerMesBalance !== undefined ? { desde: primerMesBalance, hasta: finDeMes(mes) } : skipToken,
  );
  // Variación patrimonial de un mes cerrado: el elegido, o el anterior si el elegido está en curso.
  const mesCerrado = periodos.enCurso ? sumarMeses(mes, -1) : mes;
  const hayMesCerrado = inicioDatos !== null && mesCerrado >= inicioDeMes(inicioDatos);
  const variacion = useEstadisticasVariacionQuery(
    verBalance && hayMesCerrado ? { d1: sumarDias(mesCerrado, -1), d2: finDeMes(mesCerrado) } : skipToken,
  );
  const conInteranual = hayInteranual(mes, hoy, inicioDatos);
  const rangoAnio = rangoInteranual(periodos.actual);
  const resumenAnio = useEstadisticasResumenPeriodoQuery(verBalance && conInteranual ? rangoAnio : skipToken);

  const reintentar = (...qs: { refetch: () => unknown; isUninitialized: boolean }[]) => () => {
    for (const q of qs) if (!q.isUninitialized) void q.refetch();
  };

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

        <EstadoConsulta
          datos={resumen.data !== undefined && (periodos.anterior === null || resumenAnterior.data !== undefined) ? resumen.data : undefined}
          cargando={resumen.isFetching || resumenAnterior.isFetching}
          error={resumen.error ?? resumenAnterior.error}
          reintentar={reintentar(resumen, resumenAnterior)}
        >
          {(actual) => (
            <TarjetasComparativa
              periodos={periodos}
              actual={actual}
              anterior={periodos.anterior === null ? null : (resumenAnterior.data ?? null)}
            />
          )}
        </EstadoConsulta>

        {verGastos && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <EstadoConsulta
                datos={movimientos.data}
                cargando={movimientos.isFetching}
                error={movimientos.error}
                reintentar={reintentar(movimientos)}
              >
                {(movs) => <GraficoGastoDiario dias={gastoNetoPorDia(movs, mes, hoy)} />}
              </EstadoConsulta>
              <EstadoConsulta
                datos={categorias.data !== undefined && resumen.data !== undefined ? categorias.data : undefined}
                cargando={categorias.isFetching || resumen.isFetching}
                error={categorias.error ?? resumen.error}
                reintentar={reintentar(categorias, resumen)}
              >
                {(cats) => <GastoPorCategoria categorias={cats} gastosNetos={resumen.data?.gastos_netos ?? '0'} />}
              </EstadoConsulta>
            </div>
            <EstadoConsulta
              datos={metodos.data}
              cargando={metodos.isFetching}
              error={metodos.error}
              reintentar={reintentar(metodos)}
            >
              {(ms) => <MetodosPago metodos={ms} />}
            </EstadoConsulta>
          </>
        )}

        {verIngresos && (
          <EstadoConsulta
            datos={movimientos.data !== undefined && categoriasUsuario.data !== undefined ? movimientos.data : undefined}
            cargando={movimientos.isFetching || categoriasUsuario.isFetching}
            error={movimientos.error ?? categoriasUsuario.error}
            reintentar={reintentar(movimientos, categoriasUsuario)}
          >
            {(movs) => <IngresosPorCategoria ingresos={ingresosPorCategoria(movs, categoriasUsuario.data ?? [])} />}
          </EstadoConsulta>
        )}

        {verBalance && (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <EstadoConsulta
                datos={primerMesBalance === undefined ? [] : resumenMensual.data}
                cargando={resumenMensual.isFetching}
                error={resumenMensual.error}
                reintentar={reintentar(resumenMensual)}
              >
                {(ms) => <BalanceMensual meses={ms} hoy={hoy} inicioDatos={inicioDatos} />}
              </EstadoConsulta>
              {hayMesCerrado ? (
                <EstadoConsulta
                  datos={variacion.data}
                  cargando={variacion.isFetching}
                  error={variacion.error}
                  reintentar={reintentar(variacion)}
                >
                  {(v) => <TarjetaVariacion mes={mesCerrado} variacion={v} />}
                </EstadoConsulta>
              ) : (
                <Card titulo={t('variacion.tituloSinMes')}>
                  <EmptyState titulo={t('variacion.sinMesCerrado')} className="py-6" />
                </Card>
              )}
            </div>
            {conInteranual && (
              <EstadoConsulta
                datos={resumenAnio.data}
                cargando={resumenAnio.isFetching}
                error={resumenAnio.error}
                reintentar={reintentar(resumenAnio)}
              >
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
