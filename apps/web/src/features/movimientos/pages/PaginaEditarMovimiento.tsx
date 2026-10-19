import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useIdioma, useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { hoy as hoyEn } from '@/shared/lib/fechas';
import { Button, Card, EmptyState, PantallaCarga, importeParaEditar, clasesBoton } from '@/shared/ui';
import { useMovimientosDevueltoQuery, useMovimientosObtenerQuery } from '../api/movimientosApi';
import { FormularioMovimiento } from '../components/FormularioMovimiento';
import { useCatalogos } from '../hooks/useCatalogos';
import { useVolver } from '../hooks/useVolver';
import { valoresDesdeMovimiento } from '../schemas/movimiento';

export default function PaginaEditarMovimiento() {
  const t = useT('movimientos');
  const tc = useT('common');
  const { locale } = useIdioma();
  const { id = '' } = useParams();
  const catalogos = useCatalogos();
  const mov = useMovimientosObtenerQuery(id);
  const esGasto = mov.data?.tipo === 'gasto';
  const devuelto = useMovimientosDevueltoQuery(id, { skip: !esGasto });
  const volver = useVolver(`/movimientos/${id}`);
  const hoy = useMemo(() => hoyEn(), []);

  let contenido;
  if (catalogos.cargando || mov.isLoading || (esGasto && devuelto.isLoading)) {
    contenido = <PantallaCarga />;
  } else if (catalogos.error || mov.isError || devuelto.isError) {
    contenido = (
      <EmptyState
        titulo={t('detalle.error')}
        accion={
          <Button
            variante="secundario"
            onClick={() => {
              catalogos.reintentar();
              void mov.refetch();
            }}
          >
            {tc('accion.reintentar')}
          </Button>
        }
      />
    );
  } else if (!mov.data) {
    contenido = (
      <EmptyState
        titulo={t('detalle.noEncontradoTitulo')}
        descripcion={t('detalle.noEncontradoTexto')}
        accion={
          <Link to="/movimientos" className={clasesBoton('secundario')}>
            {t('detalle.volverLista')}
          </Link>
        }
      />
    );
  } else {
    const m = mov.data;
    const cerrada = [m.cuenta_id, m.cuenta_destino_id]
      .map((c) => (c === null ? undefined : catalogos.cuentaPorId.get(c)))
      .find((c) => c?.fecha_cierre != null);
    contenido =
      cerrada !== undefined ? (
        <EmptyState titulo={t('detalle.cuentaCerrada', { cuenta: cerrada.nombre })} />
      ) : (
        <FormularioMovimiento
          key={m.id}
          inicial={valoresDesdeMovimiento(m, importeParaEditar(m.importe, locale))}
          cuentas={catalogos.cuentas}
          categorias={catalogos.categorias}
          hoy={hoy > m.fecha ? hoy : m.fecha}
          original={m}
          devueltoOriginal={esGasto ? (devuelto.data ?? null) : null}
          onGuardado={volver}
          onCancelar={volver}
        />
      );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <CabeceraPagina titulo={t('editar.titulo')} volverA={`/movimientos/${id}`} />
      <Card>{contenido}</Card>
    </div>
  );
}
