import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { useT, type FuncionT } from '@/shared/i18n';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { Card, EmptyState, LecturaGrafico } from '@/shared/ui';
import { useLocale } from '../hooks/useLocale';
import type { PasoCascada } from '../schemas/esquemas';

/** Fracción (0–1) de `c` entre `min` y `max`, con céntimos bigint: solo es una coordenada. */
function fraccion(c: bigint, min: bigint, max: bigint): number {
  if (max <= min) return 0;
  return Number(((c - min) * 10_000n) / (max - min)) / 10_000;
}

export interface BarraCascada {
  paso: PasoCascada;
  /** Tramo vertical en % desde abajo. */
  abajo: number;
  alto: number;
  /** ¿Sube (ingresos, categoría en negativo) o baja (gasto)? Los totales son 'total'. */
  sentido: 'total' | 'sube' | 'baja';
}

/**
 * Geometría de la cascada a partir de los pasos de SQL (inicio y fin exactos). El eje incluye
 * siempre el 0; un balance negativo baja por debajo de la línea del cero.
 */
export function barrasCascada(pasos: readonly PasoCascada[]): { barras: BarraCascada[]; cero: number } {
  const valores = pasos.flatMap((p) => [aCentimos(p.inicio), aCentimos(p.fin)]);
  const min = valores.reduce((a, b) => (b < a ? b : a), 0n);
  const max = valores.reduce((a, b) => (b > a ? b : a), 0n);
  const barras = pasos.map((paso) => {
    const a = fraccion(aCentimos(paso.inicio), min, max) * 100;
    const b = fraccion(aCentimos(paso.fin), min, max) * 100;
    const total = paso.tipo === 'ingresos' || paso.tipo === 'balance';
    return {
      paso,
      abajo: Math.min(a, b),
      alto: Math.max(Math.abs(b - a), 0.6),
      sentido: total ? ('total' as const) : aCentimos(paso.fin) >= aCentimos(paso.inicio) ? ('sube' as const) : ('baja' as const),
    };
  });
  return { barras, cero: fraccion(0n, min, max) * 100 };
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
 * Cascada del mes: Ingresos → gasto de cada categoría → Balance. Los pasos, sus acumulados y el
 * balance salen de SQL (`cascada_analisis`); aquí solo se dibujan. Se recorre con ratón, dedo o
 * teclado, y la tabla oculta da las cifras exactas a los lectores de pantalla.
 */
export function GraficoCascada({ pasos }: { pasos: readonly PasoCascada[] }) {
  const t = useT('analisis');
  const locale = useLocale();
  const nombreDe = useNombreCategoria();
  const { barras, cero } = barrasCascada(pasos);
  const n = barras.length;
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: Math.max(n, 1), inicial: Math.max(n - 1, 0) });

  if (n === 0) {
    return (
      <Card titulo={t('cascada.titulo')}>
        <EmptyState titulo={t('cascada.vacio')} className="py-6" />
      </Card>
    );
  }

  const elegida = barras[Math.min(indice, n - 1)];
  const importeDe = (p: PasoCascada) =>
    p.tipo === 'ingresos' || p.tipo === 'balance'
      ? formatearEuros(p.importe, locale, p.tipo === 'balance' ? { signo: 'siempre' } : {})
      : formatearEuros(p.importe, locale, { signo: 'siempre' });

  return (
    <Card titulo={t('cascada.titulo')}>
      <div className="flex flex-col gap-3">
        {elegida && (
          <LecturaGrafico data-testid="lectura-cascada" titulo={etiquetaPaso(elegida.paso, t, nombreDe)} valor={importeDe(elegida.paso)}>
            {elegida.sentido !== 'total' && (
              <span className="cifras text-xs text-apagado sm:text-sm">
                {t('cascada.acumulado', { importe: formatearEuros(elegida.paso.fin, locale) })}
              </span>
            )}
          </LecturaGrafico>
        )}
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('cascada.control')}
          aria-valuemin={1}
          aria-valuemax={n}
          aria-valuenow={indice + 1}
          aria-valuetext={elegida ? `${etiquetaPaso(elegida.paso, t, nombreDe)} ${importeDe(elegida.paso)}` : ''}
          onKeyDown={alTeclado}
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          <div aria-hidden="true" className="relative flex h-52 cursor-crosshair touch-pan-y select-none" {...superficie}>
            <span className="absolute inset-x-0 border-t border-borde-fuerte" style={{ bottom: `${cero}%` }} />
            {barras.map((b, i) => (
              <span
                key={`${b.paso.tipo}-${i}`}
                className={cx('relative h-full min-w-0 flex-1 rounded-md px-[3px] sm:px-1.5', i === indice && 'bg-superficie-2')}
              >
                <span
                  data-testid="barra-cascada"
                  className={cx('absolute inset-x-[3px] rounded-sm sm:inset-x-1.5', COLOR[b.sentido], i !== indice && 'opacity-75')}
                  style={{ bottom: `${b.abajo}%`, height: `${b.alto}%` }}
                />
              </span>
            ))}
          </div>
          {/*
            Nombres bajo cada barra. En el móvil no caben en horizontal (se partían en sílabas): van en
            vertical, enteros, y el gráfico es el mismo que en el ordenador.
          */}
          <div aria-hidden="true" className="mt-1.5 flex text-[11px] text-apagado sm:text-xs">
            {barras.map((b, i) => (
              <span
                key={`${b.paso.tipo}-${i}`}
                className={cx(
                  'flex min-w-0 flex-1 justify-center px-0.5 text-center sm:line-clamp-2 sm:block sm:break-words',
                  i === indice && 'font-semibold text-texto',
                )}
              >
                <span className="whitespace-nowrap [writing-mode:vertical-rl] rotate-180 sm:whitespace-normal sm:[writing-mode:horizontal-tb] sm:rotate-0">
                  {etiquetaPaso(b.paso, t, nombreDe)}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-apagado sm:text-sm" aria-hidden="true">
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
