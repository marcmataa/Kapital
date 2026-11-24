import { AyudaGrafico, Card, EmptyState, LecturaGrafico } from '@/shared/ui';
import { useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { emparejar, type FilaIngresoCategoria, type IngresoCategoria } from '../lib/agregaciones';
import type { PeriodosComparacion } from '../lib/periodos';
import { BarrasComparadas, LeyendaMeses, useTituloVs } from './BarrasComparadas';

interface Props {
  /** Ingresos del tramo por categoría, con su % del total (repartirIngresos). */
  ingresos: readonly IngresoCategoria[];
  /** Ingresos por categoría del mismo tramo del mes anterior; null = no hay mes anterior. */
  anteriores: readonly FilaIngresoCategoria[] | null;
  periodos: PeriodosComparacion;
}

/**
 * Ingresos por categoría de ingreso (las devoluciones nunca aparecen aquí), con la misma forma
 * que las categorías de gasto: barra gruesa de este mes y fina del anterior. Arriba, la lectura de
 * la categoría elegida con su % del total; se recorre con el ratón, el dedo o ↑/↓.
 */
export function IngresosPorCategoria({ ingresos, anteriores, periodos }: Props) {
  const t = useT('estadisticas');
  const nombreCategoria = useNombreCategoriaCatalogo();
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const titulo = useTituloVs(periodos, t('ingresos.tituloVs'));
  const filas = emparejar(
    ingresos.map((i) => ({ id: i.id, nombre: nombreCategoria(i), color: i.color, importe: i.importe })),
    (anteriores ?? []).map((a) => ({
      id: a.categoria_id,
      nombre: nombreCategoria({ id: a.categoria_id, nombre: a.nombre }),
      color: a.color,
      importe: a.ingreso,
    })),
    anteriores !== null,
  );
  const porcentajes = new Map(ingresos.map((i) => [i.id, i.porcentaje]));
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: filas.length, inicial: 0, eje: 'y' });
  const elegida = filas[indice];
  const valor = (importe: string) => formatearEuros(importe, locale);
  const detalle = (id: string) =>
    t('barras.porcentaje', { porcentaje: formatearPorcentaje(porcentajes.get(id) ?? '0', locale) });

  return (
    <Card titulo={titulo} accion={filas.length > 0 ? <AyudaGrafico unidad="categoria" definicion={t('ayuda.ingresosCategoria')} /> : undefined}>
      {filas.length === 0 ? (
        <EmptyState titulo={t('ingresos.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          {elegida && (
            <LecturaGrafico data-testid="lectura-barras" titulo={elegida.nombre} valor={valor(elegida.actual)}>
              <span className="cifras text-xs text-apagado sm:text-sm">{detalle(elegida.id)}</span>
            </LecturaGrafico>
          )}
          <LeyendaMeses periodos={periodos} />
          <div
            role="slider"
            tabIndex={0}
            aria-label={t('barras.control', { grafico: titulo })}
            aria-valuemin={1}
            aria-valuemax={filas.length}
            aria-valuenow={indice + 1}
            aria-valuetext={elegida ? `${elegida.nombre} · ${valor(elegida.actual)} · ${detalle(elegida.id)}` : undefined}
            onKeyDown={alTeclado}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            <BarrasComparadas
              filas={filas}
              etiqueta={t('ingresos.titulo')}
              seleccion={{ indice, superficie }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
