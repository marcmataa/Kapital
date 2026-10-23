import { skipToken } from '@reduxjs/toolkit/query';
import { useListarCuentasQuery } from '@/shared/api/catalogos';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { useNombreUsuario } from '@/shared/hooks/useNombreUsuario';
import { useIdioma, useT } from '@/shared/i18n';
import { finDeMes, inicioDeMes, mismoDiaMesAnterior, sumarMeses } from '@/shared/lib/fechas';
import { inicioDeDatos, periodosComparacion } from '@/shared/lib/periodos';
import { CabeceraPagina } from '@/shared/layout';
import { Card, EmptyState } from '@/shared/ui';
import {
  useInicioGastoCategoriasQuery,
  useInicioResumenQuery,
  useInicioSeriePatrimonioQuery,
  useInicioValoresCuentasQuery,
} from '../api/inicioApi';
import { AnalisisDestacado } from '../components/AnalisisDestacado';
import { DonutCategorias } from '../components/DonutCategorias';
import { ErrorCarga, Esqueleto } from '../components/Estados';
import { GraficoCapital } from '../components/GraficoCapital';
import { SelectorMes } from '../components/SelectorMes';
import { TarjetaObjetivos } from '../components/TarjetaObjetivos';
import { TarjetasKpi } from '../components/TarjetasKpi';
import { UltimosMovimientos } from '../components/UltimosMovimientos';
import { useMesSeleccionado } from '../hooks/useMesSeleccionado';
import { mesLargo } from '../lib/calculos';
import type { CuentaDesglose } from '../lib/desglose';

interface EstadoConsulta {
  isUninitialized: boolean;
  isError: boolean;
  currentData?: unknown;
}

/** Cargando los datos de sus argumentos actuales (al cambiar de mes no se enseñan los del anterior). */
const pendiente = (q: EstadoConsulta) => !q.isUninitialized && !q.isError && q.currentData === undefined;

/**
 * Inicio de un mes (`?mes=YYYY-MM`; sin parámetro, el mes en curso). Reglas: secciones 3, 4, 7 y 8.
 * - Mes en curso: patrimonio a hoy vs d' y 1..hoy vs 1..d' del mes anterior.
 * - Mes cerrado: patrimonio al último día vs su d' y mes completo vs mes anterior completo.
 * Si el tramo anterior empieza antes del primer día con datos, no tiene la misma longitud:
 * «Sin datos del mes anterior» (sección 8). Todos los periodos salen de `periodosComparacion`,
 * la misma función que Estadísticas; las cifras, de las RPC (nada de dinero calculado aquí).
 * - Gráfico de capital (serie diaria), donut de categorías y destacados del análisis del mes.
 * - Últimos movimientos y objetivos: siempre del mes en curso.
 */
export default function PaginaInicio() {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const { hoy } = useHoyUsuario();
  const { dePila } = useNombreUsuario();
  const nombreCategoria = useNombreCategoriaCatalogo();

  const cuentas = useListarCuentasQuery();
  const inicioDatos = cuentas.data ? inicioDeDatos(cuentas.data) : null;
  const seleccion = useMesSeleccionado(hoy, inicioDatos, !cuentas.isLoading);
  const { mes, enCurso, resuelto } = seleccion;
  const periodos = periodosComparacion(mes, hoy, inicioDatos);
  // Fecha de referencia d del patrimonio: hoy (provisional) o el cierre del último día del mes.
  const referencia = enCurso ? hoy : finDeMes(mes);
  const dPrima = mismoDiaMesAnterior(referencia);
  const mesAnterior = sumarMeses(mes, -1);

  const resumen = useInicioResumenQuery(resuelto ? periodos.actual : skipToken);
  const resumenAnterior = useInicioResumenQuery(resuelto && periodos.anterior ? periodos.anterior : skipToken);
  const serie = useInicioSeriePatrimonioQuery(resuelto ? { desde: mes, hasta: finDeMes(mes), hoy } : skipToken);
  const serieAnterior = useInicioSeriePatrimonioQuery(
    resuelto ? { desde: mesAnterior, hasta: finDeMes(mesAnterior), hoy } : skipToken,
  );
  const categorias = useInicioGastoCategoriasQuery(resuelto ? periodos.actual : skipToken);

  // Objetivos: del mes en curso, se mire el mes que se mire (en curso, comparte caché con lo de arriba).
  const tramoEnCurso = { desde: inicioDeMes(hoy), hasta: hoy };
  const resumenEnCurso = useInicioResumenQuery(tramoEnCurso);
  const categoriasEnCurso = useInicioGastoCategoriasQuery(tramoEnCurso);

  const datosResumen = resumen.currentData;
  const datosSerie = serie.currentData;
  const datosSerieAnterior = serieAnterior.currentData;
  const datosCategorias = categorias.currentData;
  const patrimonioRef = datosSerie?.find((p) => p.fecha === referencia)?.patrimonio ?? null;
  const patrimonioAnterior = datosSerieAnterior?.find((p) => p.fecha === dPrima)?.patrimonio ?? null;

  // Desglose por cuenta a la fecha de referencia. En curso: valor de hoy (v_saldos, ya en
  // listarCuentas). Mes cerrado: valores_cuentas(último día), ambos pedidos como texto.
  const valoresCierre = useInicioValoresCuentasQuery(resuelto && !enCurso ? referencia : skipToken);
  let cuentasDesglose: CuentaDesglose[] | undefined;
  if (enCurso) {
    cuentasDesglose = cuentas.data;
  } else if (cuentas.data && valoresCierre.currentData) {
    const valores = new Map(valoresCierre.currentData.map((v) => [v.cuenta_id, v.valor]));
    cuentasDesglose = cuentas.data.map((c) => ({ ...c, valor: valores.get(c.id) ?? null }));
  }

  const kpiCargando =
    !resuelto ||
    cuentas.isLoading ||
    pendiente(resumen) ||
    pendiente(resumenAnterior) ||
    pendiente(serie) ||
    pendiente(serieAnterior);
  const kpiError = resumen.isError || serie.isError || serieAnterior.isError;
  const reintentar = (...qs: { refetch: () => unknown; isUninitialized: boolean }[]) => () => {
    for (const q of qs) if (!q.isUninitialized) void q.refetch();
  };

  return (
    <>
      {/* La pestaña se queda en «Hola · Kapital»: el nombre no sale en el historial ni en el selector de apps. */}
      <CabeceraPagina
        titulo={dePila === null ? t('titulo') : t('tituloConNombre', { nombre: dePila })}
        tituloDocumento={t('titulo')}
        descripcion={t('descripcion')}
        acciones={
          <SelectorMes
            mes={mes}
            anterior={seleccion.anterior}
            siguiente={seleccion.siguiente}
            onElegir={seleccion.elegir}
          />
        }
      />

      <div className="flex flex-col gap-4 sm:gap-5">
        {kpiCargando ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Esqueleto className="h-28" />
            <Esqueleto className="h-28" />
            <Esqueleto className="h-28" />
          </div>
        ) : kpiError || !datosResumen ? (
          <ErrorCarga onReintentar={reintentar(resumen, resumenAnterior, cuentas, serie, serieAnterior)} />
        ) : (
          <TarjetasKpi
            hoy={hoy}
            mes={mes}
            patrimonioHoy={patrimonioRef}
            patrimonioAnterior={patrimonioAnterior}
            resumenActual={datosResumen}
            // Sin el resumen anterior (o si su tramo es parcial), las tarjetas dicen «Sin datos del mes anterior».
            resumenAnterior={periodos.anterior ? (resumenAnterior.currentData ?? null) : null}
            cuentas={cuentasDesglose}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
          <Card className="min-w-0">
            {!resuelto || pendiente(serie) || pendiente(serieAnterior) ? (
              <Esqueleto className="h-80" />
            ) : serie.isError || serieAnterior.isError || !datosSerie || !datosSerieAnterior ? (
              <ErrorCarga onReintentar={reintentar(serie, serieAnterior)} />
            ) : (
              <GraficoCapital key={`${mes}:${hoy}`} hoy={hoy} mes={mes} actual={datosSerie} anterior={datosSerieAnterior} />
            )}
          </Card>

          <Card titulo={t('categorias.titulo')} className="flex min-w-0 flex-col gap-4">
            {!resuelto || pendiente(categorias) || pendiente(resumen) ? (
              <Esqueleto className="h-44" />
            ) : categorias.isError || resumen.isError || !datosCategorias || !datosResumen ? (
              <ErrorCarga onReintentar={reintentar(categorias, resumen)} />
            ) : datosCategorias.some((c) => c.gasto !== '0.00') ? (
              <DonutCategorias
                categorias={datosCategorias.map((c) => ({
                  id: c.categoria_id,
                  nombre: nombreCategoria({ id: c.categoria_id, nombre: c.nombre }),
                  color: c.color,
                  gasto: c.gasto,
                }))}
                totalGastoNeto={datosResumen.gastos_netos}
              />
            ) : (
              <EmptyState
                titulo={enCurso ? t('categorias.vacio') : t('categorias.vacioCerrado', { mes: mesLargo(mes, locale) })}
                className="py-6"
              />
            )}
            {resuelto && <AnalisisDestacado mes={enCurso ? undefined : mes} />}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          <UltimosMovimientos />
          <TarjetaObjetivos hoy={hoy} balance={resumenEnCurso.data?.balance} gastos={categoriasEnCurso.data} />
        </div>
      </div>
    </>
  );
}
