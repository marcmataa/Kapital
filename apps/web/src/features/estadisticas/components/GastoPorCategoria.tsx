import { Card, EmptyState } from '@/shared/ui';
import { useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import type { GastoCategoria } from '../api/estadisticasApi';
import { enlaceMovimientos } from '@/shared/lib/enlaces';
import { emparejar } from '../lib/agregaciones';
import type { PeriodosComparacion } from '../lib/periodos';
import { signo } from '../lib/formato';
import { BarrasComparadas, LeyendaMeses, useTituloVs } from './BarrasComparadas';

interface Props {
  /** Gasto neto por categoría del tramo actual (gasto_por_categoria). */
  categorias: readonly GastoCategoria[];
  /** El mismo tramo del mes anterior; null = no existe (sección 8). */
  anteriores: readonly GastoCategoria[] | null;
  /** Tramos comparados: dan el título («Categorías: Nov vs Oct») y el enlace de cada fila (F08). */
  periodos: PeriodosComparacion;
}

/**
 * Gasto neto por categoría (sección 8: gastos − devoluciones) de este tramo frente al mismo tramo
 * del mes anterior, de más a menos. Las categorías en negativo (te devolvieron más de lo que
 * gastaste) se listan aparte, con su número en negativo, sin barra.
 */
export function GastoPorCategoria({ categorias, anteriores, periodos }: Props) {
  const t = useT('estadisticas');
  const nombreCategoria = useNombreCategoriaCatalogo();
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const titulo = useTituloVs(periodos, t('categorias.tituloVs'));
  const hayAnterior = anteriores !== null;
  const comoFila = (c: GastoCategoria) => ({
    id: c.categoria_id,
    nombre: nombreCategoria({ id: c.categoria_id, nombre: c.nombre }),
    color: c.color,
    importe: c.gasto,
  });
  const filas = emparejar(categorias.map(comoFila), (anteriores ?? []).map(comoFila), hayAnterior).map((f) => ({
    ...f,
    href: enlaceMovimientos({ categoria: f.id, ...periodos.actual }),
  }));
  const visibles = filas.filter((f) => signo(f.actual) > 0 || (f.anterior !== null && signo(f.actual) === 0 && signo(f.anterior) !== 0));
  const negativas = filas.filter((f) => signo(f.actual) < 0);

  return (
    <Card titulo={titulo}>
      {visibles.length === 0 && negativas.length === 0 ? (
        <EmptyState titulo={t('categorias.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          <LeyendaMeses periodos={periodos} />
          <BarrasComparadas filas={visibles} etiqueta={t('categorias.lista')} />
          {negativas.length > 0 && (
            <ul aria-label={t('categorias.negativasTitulo')} className="flex flex-col gap-2 border-t border-borde pt-3 text-sm">
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
        </div>
      )}
    </Card>
  );
}
