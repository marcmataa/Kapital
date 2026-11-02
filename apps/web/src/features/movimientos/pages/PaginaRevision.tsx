import { Link } from 'react-router';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { Button, Card, EmptyState, PantallaCarga, clasesBoton } from '@/shared/ui';
import { useMovimientosPendientesRevisionQuery, type DevolucionPendiente } from '../api/sqlApi';
import { useCatalogos } from '../hooks/useCatalogos';

/**
 * Devoluciones pendientes de revisión (reglas, sección 3): las antiguas sin gasto original y las
 * vinculadas que incumplen las reglas (fecha anterior a su compra u otra categoría). Siguen
 * contando en los totales tal como están. Nada se vincula ni se corrige solo: cada una se abre en
 * el formulario de edición, que exige elegir el gasto original y pone su categoría.
 */
export default function PaginaRevision() {
  const t = useT('movimientos');
  const tc = useT('common');
  const { locale } = useIdioma();
  const catalogos = useCatalogos();
  const nombreCategoria = useNombreCategoria();
  const q = useMovimientosPendientesRevisionQuery();

  const motivo = (d: DevolucionPendiente): string => {
    const gasto = d.gasto_fecha !== null ? formatearFecha(d.gasto_fecha, locale) : '';
    if (d.motivo === 'fecha_anterior') return t('revision.motivo.fechaAnterior', { fecha: gasto });
    if (d.motivo === 'otra_categoria') {
      const cat = catalogos.categoriaPorId.get(d.categoria_id);
      return t('revision.motivo.otraCategoria', { categoria: cat ? nombreCategoria(cat) : '—' });
    }
    return t('revision.motivo.sinVincular');
  };

  let contenido;
  if (q.isLoading || catalogos.cargando) {
    contenido = <PantallaCarga />;
  } else if (q.isError) {
    contenido = (
      <EmptyState
        titulo={t('revision.error')}
        accion={
          <Button variante="secundario" onClick={() => void q.refetch()}>
            {tc('accion.reintentar')}
          </Button>
        }
      />
    );
  } else if ((q.data ?? []).length === 0) {
    contenido = <EmptyState titulo={t('revision.vacio')} descripcion={t('revision.vacioTexto')} />;
  } else {
    contenido = (
      <Card sinPadding>
        <ul className="divide-y divide-borde" aria-label={t('revision.lista')}>
          {(q.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-[1_1_14rem]">
                <p className="truncate font-medium text-texto">{d.concepto}</p>
                <p className="text-xs text-apagado sm:text-sm">
                  {formatearFecha(d.fecha, locale)}
                  {d.gasto_concepto !== null && ` · ${t('revision.vinculadaA', { concepto: d.gasto_concepto })}`}
                </p>
                <p className="mt-0.5 text-xs text-negativo sm:text-sm">{motivo(d)}</p>
              </div>
              <span className="cifras font-semibold text-positivo">{formatearEuros(d.importe, locale, { signo: 'siempre' })}</span>
              <Link
                to={`/movimientos/${d.id}/editar`}
                className={cx(clasesBoton('secundario'), 'area-tactil')}
                aria-label={t('revision.corregirEtiqueta', { concepto: d.concepto })}
              >
                {t('revision.corregir')}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraPagina titulo={t('revision.titulo')} descripcion={t('revision.descripcion')} volverA="/movimientos" />
      {contenido}
    </div>
  );
}
