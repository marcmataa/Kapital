import { Card, EmptyState } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import type { GastoCategoria } from '../api/estadisticasApi';
import { emparejar } from '../lib/agregaciones';
import { signo } from '../lib/formato';
import { FilasComparadas } from './FilasComparadas';

interface Props {
  /** Gasto neto por categoría del tramo actual (gasto_por_categoria). */
  categorias: readonly GastoCategoria[];
  /** El mismo tramo del mes anterior; null = no existe (sección 8). */
  anteriores: readonly GastoCategoria[] | null;
  /** «vs mes anterior al día 19» / «vs septiembre completo». */
  titulo: string;
}

const comoFila = (c: GastoCategoria) => ({ id: c.categoria_id, nombre: c.nombre, color: c.color, importe: c.gasto });

/**
 * Gasto neto por categoría (sección 8: gastos − devoluciones) de este tramo frente al mismo tramo
 * del mes anterior. Las categorías en negativo (te devolvieron más de lo que gastaste) se listan
 * aparte, con su número en negativo, sin barra ni porcentaje.
 */
export function GastoPorCategoria({ categorias, anteriores, titulo }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const filas = emparejar(categorias.map(comoFila), (anteriores ?? []).map(comoFila), anteriores !== null);
  const visibles = filas.filter((f) => signo(f.actual) > 0 || (f.anterior !== null && signo(f.actual) === 0 && signo(f.anterior) !== 0));
  const negativas = filas.filter((f) => signo(f.actual) < 0);

  return (
    <Card titulo={titulo}>
      {visibles.length === 0 && negativas.length === 0 ? (
        <EmptyState titulo={t('categorias.vacio')} className="py-6" />
      ) : (
        <>
          <FilasComparadas filas={visibles} etiqueta={t('categorias.lista')} etiquetaAnterior={t('desglose.antes')} />
          {negativas.length > 0 && (
            <ul aria-label={t('categorias.negativasTitulo')} className="mt-3 flex flex-col gap-2 border-t border-borde pt-3 text-sm">
              {negativas.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 text-apagado">
                  <span>
                    {c.nombre} <span className="text-xs">({t('categorias.negativaNota')})</span>
                  </span>
                  <span className="cifras shrink-0 text-negativo">{formatearEuros(c.actual, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
