import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useT, type FuncionT } from '@/shared/i18n';
import { geometriaCascada, type TramoCascada } from '@/shared/lib/cascada';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { Card, EmptyState } from '@/shared/ui';
import { useLocale } from '../hooks/useLocale';
import type { PasoCascada } from '../schemas/esquemas';

export interface BarraCascada extends TramoCascada<PasoCascada> {
  /** ¿Sube (ingresos, categoría en negativo) o baja (gasto)? Los totales son 'total'. */
  sentido: 'total' | 'sube' | 'baja';
}

/**
 * Geometría de la cascada a partir de los pasos de SQL (inicio y fin exactos). El eje incluye
 * siempre el 0; un balance negativo queda a la izquierda de la línea del cero.
 */
export function barrasCascada(pasos: readonly PasoCascada[]): { barras: BarraCascada[]; cero: number } {
  const { tramos, cero } = geometriaCascada(pasos);
  const barras = tramos.map((tramo) => {
    const { paso } = tramo;
    const total = paso.tipo === 'ingresos' || paso.tipo === 'balance';
    return {
      ...tramo,
      sentido: total ? ('total' as const) : aCentimos(paso.fin) >= aCentimos(paso.inicio) ? ('sube' as const) : ('baja' as const),
    };
  });
  return { barras, cero };
}

function etiquetaPaso(paso: PasoCascada, t: FuncionT<'analisis'>, nombreDe: ReturnType<typeof useNombreCategoria>): string {
  switch (paso.tipo) {
    case 'ingresos':
      return t('cascada.ingresos');
    case 'balance':
      return t('cascada.balance');
    case 'otras':
      return t('cascada.otras');
    case 'sin_categoria':
      return t('cascada.sinCategoria');
    default:
      return paso.nombre === null ? t('cascada.otras') : nombreDe({ nombre: paso.nombre, clave: paso.clave });
  }
}

const COLOR: Record<BarraCascada['sentido'], string> = {
  total: 'bg-acento',
  baja: 'bg-negativo',
  sube: 'bg-positivo',
};

/**
 * Cascada del mes en horizontal: una fila por paso (etiqueta, barra, importe), de Ingresos a
 * Balance, con una línea fina que une el final de cada paso con el comienzo del siguiente. En
 * horizontal las etiquetas caben enteras (sin partir palabras) en el móvil y en la media columna
 * del escritorio, y cada importe se lee sin pasar el ratón. Los pasos, sus acumulados y el
 * balance salen de SQL (`cascada_analisis`); aquí solo se dibujan. La tabla oculta da las cifras
 * exactas a los lectores de pantalla.
 */
export function GraficoCascada({ pasos }: { pasos: readonly PasoCascada[] }) {
  const t = useT('analisis');
  const locale = useLocale();
  const nombreDe = useNombreCategoria();
  const { barras, cero } = barrasCascada(pasos);

  if (barras.length === 0) {
    return (
      <Card titulo={t('cascada.titulo')}>
        <EmptyState titulo={t('cascada.vacio')} className="py-6" />
      </Card>
    );
  }

  const importeDe = (p: PasoCascada) =>
    p.tipo === 'ingresos' ? formatearEuros(p.importe, locale) : formatearEuros(p.importe, locale, { signo: 'siempre' });

  return (
    <Card titulo={t('cascada.titulo')}>
      <div className="flex flex-col gap-3">
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-stretch gap-x-3">
          {barras.map((b, i) => {
            const total = b.sentido === 'total';
            const siguiente = i < barras.length - 1;
            return (
              <div key={`${b.paso.tipo}-${i}`} className="contents">
                <span
                  className={cx(
                    'self-center py-1 text-sm leading-tight [overflow-wrap:normal] [word-break:normal]',
                    total ? 'font-semibold text-texto' : 'text-apagado',
                  )}
                >
                  {etiquetaPaso(b.paso, t, nombreDe)}
                </span>
                <span className="relative min-h-8">
                  {cero > 0 && <span className="absolute inset-y-0 border-l border-borde-fuerte" style={{ left: `${cero}%` }} />}
                  <span
                    data-testid="barra-cascada"
                    className={cx('absolute inset-y-1.5 rounded-sm', COLOR[b.sentido])}
                    style={{ left: `${b.abajo}%`, width: `${b.alto}%` }}
                  />
                  {siguiente && (
                    <span
                      className="absolute top-[calc(100%-0.375rem)] h-3 border-l border-dashed border-tenue"
                      style={{ left: `${b.fin}%` }}
                    />
                  )}
                </span>
                <span
                  className={cx(
                    'cifras self-center text-right text-sm whitespace-nowrap',
                    total ? 'font-semibold' : 'text-apagado',
                    b.paso.tipo === 'balance' && (aCentimos(b.paso.importe) < 0n ? 'text-negativo' : 'text-positivo'),
                  )}
                >
                  {importeDe(b.paso)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-apagado" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-acento" />
            {t('cascada.leyendaTotal')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-negativo" />
            {t('cascada.leyendaGasto')}
          </span>
        </div>
        <table className="sr-only">
          <caption>{t('cascada.titulo')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('cascada.paso')}</th>
              <th scope="col">{t('cascada.importe')}</th>
              <th scope="col">{t('cascada.acumuladoColumna')}</th>
            </tr>
          </thead>
          <tbody>
            {barras.map((b, i) => (
              <tr key={`${b.paso.tipo}-${i}`}>
                <th scope="row">{etiquetaPaso(b.paso, t, nombreDe)}</th>
                <td>{importeDe(b.paso)}</td>
                <td>{formatearEuros(b.paso.fin, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
