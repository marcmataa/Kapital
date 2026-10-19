import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useIdioma, useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { cx } from '@/shared/lib/cx';
import { Button, EmptyState, Sheet, Spinner, clasesBoton } from '@/shared/ui';
import { useMovimientosListarInfiniteQuery, useMovimientosObtenerQuery } from '../api/movimientosApi';
import { ChipsTipo } from '../components/ChipsTipo';
import { DetalleMovimiento } from '../components/DetalleMovimiento';
import { CONSULTA_ESCRITORIO, FilaMovimiento } from '../components/FilaMovimiento';
import { PanelFiltros } from '../components/PanelFiltros';
import { useCatalogos } from '../hooks/useCatalogos';
import {
  FILTROS_VACIOS,
  contarFiltrosPanel,
  filtrosAParams,
  filtrosDesdeParams,
  normalizarFiltros,
  type Filtros,
} from '../lib/filtros';
import { agruparPorMes, tituloMes } from '../lib/presentacion';
import { esUuid } from '../lib/tipos';

const ESPERA_BUSQUEDA_MS = 300;

export default function PaginaMovimientos() {
  const t = useT('movimientos');
  const tc = useT('common');
  const { locale } = useIdioma();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDesdeParams(params), [params]);
  const consulta = useMemo(() => normalizarFiltros(filtros), [filtros]);
  const sel = params.get('sel');
  const seleccionado = esUuid(sel) ? sel : null;
  const catalogos = useCatalogos();

  const lista = useMovimientosListarInfiniteQuery(consulta);
  const movimientos = useMemo(() => lista.data?.pages.flatMap((p) => p.filas) ?? [], [lista.data]);
  const grupos = useMemo(() => agruparPorMes(movimientos), [movimientos]);

  // Detalle del panel lateral: de la lista si ya está cargado; si no (enlace compartido), se pide.
  const enLista = movimientos.find((m) => m.id === seleccionado);
  const suelto = useMovimientosObtenerQuery(seleccionado ?? '', { skip: seleccionado === null || enLista !== undefined });
  const detalle = enLista ?? suelto.data ?? null;

  const actualizar = (cambios: Partial<Filtros>, opciones: { replace?: boolean } = {}) => {
    setParams((prev) => filtrosAParams({ ...filtrosDesdeParams(prev), ...cambios }, prev), opciones);
  };

  const seleccionar = (id: string | null) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (id === null) p.delete('sel');
        else p.set('sel', id);
        return p;
      },
      { replace: true },
    );
  };

  // Búsqueda: se escribe en la URL tras una pausa (sin una entrada de historial por tecla).
  const [busqueda, setBusqueda] = useState(filtros.q);
  const [qUrl, setQUrl] = useState(filtros.q);
  if (qUrl !== filtros.q) {
    // La URL cambió desde fuera (atrás/adelante, «Quitar filtros»): el campo la sigue.
    setQUrl(filtros.q);
    setBusqueda(filtros.q);
  }
  useEffect(() => {
    if (busqueda === filtros.q) return;
    const id = window.setTimeout(() => {
      setParams((prev) => filtrosAParams({ ...filtrosDesdeParams(prev), q: busqueda }, prev), { replace: true });
    }, ESPERA_BUSQUEDA_MS);
    return () => window.clearTimeout(id);
  }, [busqueda, filtros.q, setParams]);

  // Filtros: panel en línea en escritorio, hoja en móvil (se decide al pulsar, no al pintar).
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const abrirFiltros = () => {
    if (typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_ESCRITORIO).matches) {
      setPanelAbierto((v) => !v);
    } else {
      setHojaAbierta(true);
    }
  };
  const nFiltros = contarFiltrosPanel(filtros);
  const hayFiltros = nFiltros > 0 || filtros.tipo !== null || consulta.q !== '';
  const clavePanel = filtrosAParams(filtros).toString();

  const aplicarPanel = (cambios: Pick<Filtros, 'desde' | 'hasta' | 'categoria' | 'metodo' | 'cuenta'>) => {
    actualizar(cambios);
    setHojaAbierta(false);
    setPanelAbierto(false);
  };

  const hrefDetalle = (id: string) => `/movimientos/${id}`;

  let contenido;
  if (lista.isLoading || catalogos.cargando) {
    contenido = (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  } else if (lista.isError) {
    contenido = (
      <EmptyState
        titulo={t('lista.error')}
        accion={
          <Button variante="secundario" onClick={() => void lista.refetch()}>
            {tc('accion.reintentar')}
          </Button>
        }
      />
    );
  } else if (movimientos.length === 0) {
    contenido = hayFiltros ? (
      <EmptyState
        titulo={t('lista.sinResultadosTitulo')}
        descripcion={t('lista.sinResultadosTexto')}
        accion={
          <Button variante="secundario" onClick={() => setParams(filtrosAParams(FILTROS_VACIOS, params))}>
            {t('lista.quitarFiltros')}
          </Button>
        }
      />
    ) : (
      <EmptyState
        titulo={t('lista.vacioTitulo')}
        descripcion={t('lista.vacioTexto')}
        accion={
          <Link to="/movimientos/nuevo" className={clasesBoton('primario')}>
            {t('lista.nuevo')}
          </Link>
        }
      />
    );
  } else {
    contenido = (
      <>
        {grupos.map((g) => (
          <section key={g.mes} aria-labelledby={`mes-${g.mes}`}>
            <h2
              id={`mes-${g.mes}`}
              className="mx-3 mt-2.5 mb-1.5 text-[13px] font-semibold tracking-wider text-apagado uppercase"
            >
              {tituloMes(g.mes, locale)}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {g.movimientos.map((m) => (
                <FilaMovimiento
                  key={m.id}
                  movimiento={m}
                  catalogos={catalogos}
                  seleccionado={m.id === seleccionado}
                  href={hrefDetalle(m.id)}
                  onSeleccionar={seleccionar}
                />
              ))}
            </ul>
          </section>
        ))}
        {lista.hasNextPage && (
          <div className="flex justify-center pt-3">
            <Button
              variante="secundario"
              cargando={lista.isFetchingNextPage}
              onClick={() => void lista.fetchNextPage()}
            >
              {t('lista.cargarMas')}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraPagina
        titulo={t('titulo')}
        acciones={
          <>
            <Button
              variante="secundario"
              onClick={abrirFiltros}
              aria-expanded={panelAbierto || hojaAbierta}
              icono={<SlidersHorizontal aria-hidden="true" className="size-4" />}
            >
              {nFiltros > 0 ? t('filtros.botonActivos', { n: nFiltros }) : t('filtros.boton')}
            </Button>
            <Link to="/movimientos/nuevo" className={cx(clasesBoton('primario'), 'hidden lg:inline-flex')}>
              <Plus aria-hidden="true" className="size-4" />
              {t('lista.nuevo')}
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-11 min-w-0 flex-[1_1_18rem] items-center gap-2.5 rounded-xl border border-borde bg-superficie px-3.5 text-tenue focus-within:border-acento">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only">{t('lista.buscar')}</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t('lista.buscarPlaceholder')}
            maxLength={200}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-base text-texto placeholder:text-tenue focus:outline-none sm:text-[15px]"
          />
        </label>
        <ChipsTipo valor={filtros.tipo} onChange={(tipo) => actualizar({ tipo })} />
      </div>

      {panelAbierto && (
        <PanelFiltros
          key={clavePanel}
          variante="panel"
          className="hidden lg:grid"
          filtros={filtros}
          cuentas={catalogos.cuentas}
          categorias={catalogos.categorias}
          onAplicar={aplicarPanel}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section
          aria-label={t('lista.etiqueta')}
          className="min-w-0 flex-[999_1_28rem] rounded-2xl border border-borde bg-superficie p-2 pb-3"
        >
          {contenido}
        </section>
        <aside
          aria-label={t('detalle.titulo')}
          className="hidden min-w-0 flex-[1_1_20rem] rounded-2xl border border-borde bg-superficie p-5 lg:sticky lg:top-8 lg:block"
        >
          {detalle !== null ? (
            <DetalleMovimiento
              key={detalle.id}
              movimiento={detalle}
              catalogos={catalogos}
              onBorrado={() => seleccionar(null)}
            />
          ) : (
            <EmptyState titulo={t('lista.seleccionaTitulo')} descripcion={t('lista.seleccionaTexto')} />
          )}
        </aside>
      </div>

      <Sheet abierto={hojaAbierta} onCerrar={() => setHojaAbierta(false)} titulo={t('filtros.titulo')}>
        <PanelFiltros
          key={clavePanel}
          variante="hoja"
          filtros={filtros}
          cuentas={catalogos.cuentas}
          categorias={catalogos.categorias}
          onAplicar={aplicarPanel}
        />
      </Sheet>
    </div>
  );
}
