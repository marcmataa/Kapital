import { skipToken } from '@reduxjs/toolkit/query';
import { useListarCuentasQuery } from '@/shared/api/catalogos';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { useNombreUsuario } from '@/shared/hooks/useNombreUsuario';
import { useT } from '@/shared/i18n';
import { finDeMes, inicioDeMes, mismoDiaMesAnterior } from '@/shared/lib/fechas';
import { inicioDeDatos, tramoConDatos } from '@/shared/lib/periodos';
import { CabeceraPagina } from '@/shared/layout';
import { Card, EmptyState } from '@/shared/ui';
import {
  useInicioGastoCategoriasQuery,
  useInicioResumenQuery,
  useInicioSeriePatrimonioQuery,
} from '../api/inicioApi';
import { AnalisisDestacado } from '../components/AnalisisDestacado';
import { DonutCategorias } from '../components/DonutCategorias';
import { ErrorCarga, Esqueleto } from '../components/Estados';
import { GraficoCapital } from '../components/GraficoCapital';
import { TarjetaObjetivos } from '../components/TarjetaObjetivos';
import { TarjetasKpi } from '../components/TarjetasKpi';
import { UltimosMovimientos } from '../components/UltimosMovimientos';

/**
 * Inicio (mes en curso, del día 1 a hoy). Reglas: secciones 3, 4, 7 y 8.
 * - Tarjetas: patrimonio a hoy vs d' y 1..hoy vs 1..d' del mes anterior. Si 1..d' empieza antes
 *   del primer día con datos, no tiene la misma longitud: «Sin datos del mes anterior» (sección 8).
 * - Gráfico de capital (serie diaria), donut de categorías, últimos movimientos y objetivos.
 */
export default function PaginaInicio() {
  const t = useT('inicio');
  const { hoy } = useHoyUsuario();
  const { dePila } = useNombreUsuario();
  const dPrima = mismoDiaMesAnterior(hoy);
  const mes = { desde: inicioDeMes(hoy), hasta: hoy };

  const resumen = useInicioResumenQuery(mes);
  const cuentas = useListarCuentasQuery();
  const inicioDatos = cuentas.data ? inicioDeDatos(cuentas.data) : null;
  const tramoAnterior = { desde: inicioDeMes(dPrima), hasta: dPrima };
  const hayAnterior = tramoConDatos(tramoAnterior.desde, inicioDatos);
  const resumenAnterior = useInicioResumenQuery(hayAnterior ? tramoAnterior : skipToken);
  const serie = useInicioSeriePatrimonioQuery({ desde: inicioDeMes(hoy), hasta: finDeMes(hoy), hoy });
  const serieAnterior = useInicioSeriePatrimonioQuery({ desde: inicioDeMes(dPrima), hasta: finDeMes(dPrima), hoy });
  const categorias = useInicioGastoCategoriasQuery(mes);

  const patrimonioHoy = serie.data?.find((p) => p.fecha === hoy)?.patrimonio ?? null;
  const patrimonioAnterior = serieAnterior.data?.find((p) => p.fecha === dPrima)?.patrimonio ?? null;

  const kpiCargando = cuentas.isLoading || resumen.isLoading || resumenAnterior.isLoading || serie.isLoading || serieAnterior.isLoading;
  const kpiError = resumen.isError || serie.isError || serieAnterior.isError;
  const reintentarKpi = () => {
    void resumen.refetch();
    if (!resumenAnterior.isUninitialized) void resumenAnterior.refetch();
    if (!cuentas.isUninitialized) void cuentas.refetch();
    void serie.refetch();
    void serieAnterior.refetch();
  };

  return (
    <>
      {/* La pestaña se queda en «Hola · Kapital»: el nombre no sale en el historial ni en el selector de apps. */}
      <CabeceraPagina
        titulo={dePila === null ? t('titulo') : t('tituloConNombre', { nombre: dePila })}
        tituloDocumento={t('titulo')}
        descripcion={t('descripcion')}
      />

      <div className="flex flex-col gap-4 sm:gap-5">
        {kpiCargando ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Esqueleto className="h-28" />
            <Esqueleto className="h-28" />
            <Esqueleto className="h-28" />
          </div>
        ) : kpiError || !resumen.data ? (
          <ErrorCarga onReintentar={reintentarKpi} />
        ) : (
          <TarjetasKpi
            hoy={hoy}
            patrimonioHoy={patrimonioHoy}
            patrimonioAnterior={patrimonioAnterior}
            resumenActual={resumen.data}
            // Sin el resumen anterior (o si su tramo es parcial), las tarjetas dicen «Sin datos del mes anterior».
            resumenAnterior={hayAnterior ? (resumenAnterior.data ?? null) : null}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
          <Card className="min-w-0">
            {serie.isLoading || serieAnterior.isLoading ? (
              <Esqueleto className="h-80" />
            ) : serie.isError || serieAnterior.isError || !serie.data || !serieAnterior.data ? (
              <ErrorCarga
                onReintentar={() => {
                  void serie.refetch();
                  void serieAnterior.refetch();
                }}
              />
            ) : (
              <GraficoCapital key={hoy} hoy={hoy} actual={serie.data} anterior={serieAnterior.data} />
            )}
          </Card>

          <Card titulo={t('categorias.titulo')} className="flex min-w-0 flex-col gap-4">
            {categorias.isLoading || resumen.isLoading ? (
              <Esqueleto className="h-44" />
            ) : categorias.isError || resumen.isError || !categorias.data || !resumen.data ? (
              <ErrorCarga
                onReintentar={() => {
                  void categorias.refetch();
                  void resumen.refetch();
                }}
              />
            ) : categorias.data.some((c) => c.gasto !== '0.00') ? (
              <DonutCategorias
                categorias={categorias.data.map((c) => ({
                  id: c.categoria_id,
                  nombre: c.nombre,
                  color: c.color,
                  gasto: c.gasto,
                }))}
                totalGastoNeto={resumen.data.gastos_netos}
              />
            ) : (
              <EmptyState titulo={t('categorias.vacio')} className="py-6" />
            )}
            <AnalisisDestacado />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          <UltimosMovimientos />
          <TarjetaObjetivos hoy={hoy} balance={resumen.data?.balance} gastos={categorias.data} />
        </div>
      </div>
    </>
  );
}
