import { Link, useNavigate, useParams } from 'react-router';
import { useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { Button, Card, EmptyState, PantallaCarga, clasesBoton } from '@/shared/ui';
import { useMovimientosObtenerQuery } from '../api/movimientosApi';
import { DetalleMovimiento } from '../components/DetalleMovimiento';
import { useCatalogos } from '../hooks/useCatalogos';

/** Detalle en su propia página (móvil, o enlace directo). En escritorio la lista lo muestra al lado. */
export default function PaginaDetalleMovimiento() {
  const t = useT('movimientos');
  const tc = useT('common');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const catalogos = useCatalogos();
  const mov = useMovimientosObtenerQuery(id);

  let contenido;
  if (mov.isLoading || catalogos.cargando) {
    contenido = <PantallaCarga />;
  } else if (mov.isError) {
    contenido = (
      <EmptyState
        titulo={t('detalle.error')}
        accion={
          <Button variante="secundario" onClick={() => void mov.refetch()}>
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
    contenido = (
      <DetalleMovimiento
        movimiento={mov.data}
        catalogos={catalogos}
        onBorrado={() => void navigate('/movimientos', { replace: true })}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <CabeceraPagina titulo={t('detalle.titulo')} volverA="/movimientos" />
      <Card>{contenido}</Card>
    </div>
  );
}
