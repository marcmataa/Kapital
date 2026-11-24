import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { SeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { maximoAbsoluto, proporcion, type FilaComparada } from '../lib/agregaciones';
import { capitalizar, mesCorto, nombreMes } from '../lib/formato';
import type { PeriodosComparacion } from '../lib/periodos';

export interface FilaBarraComparada extends FilaComparada {
  /** Movimientos que explican la fila (auditoría F08): el nombre enlaza ahí. */
  href?: string;
}

/** «Categorías: Nov vs Oct» (o «Categorías · Noviembre» si no hay mes anterior). */
export function useTituloVs(periodos: PeriodosComparacion, base: string): string {
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const corto = (mes: string) => capitalizar(mesCorto(mes, locale).replace(/\.$/, ''));
  if (periodos.anterior === null) return `${base} · ${capitalizar(nombreMes(periodos.actual.desde, locale))}`;
  return `${base}: ${corto(periodos.actual.desde)} vs ${corto(periodos.anterior.desde)}`;
}

/** Qué mes es cada barra: la gruesa es este mes; la fina, el anterior. */
export function LeyendaMeses({ periodos }: { periodos: PeriodosComparacion }) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  if (periodos.anterior === null) return null;
  return (
    <p data-testid="leyenda-meses" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-apagado">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="block h-2.5 w-5 rounded-full bg-texto" />
        {t('barrasVs.actual', {
          mes: nombreMes(periodos.actual.desde, locale),
        })}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="block h-1 w-5 rounded-full bg-texto opacity-35" />
        {t('barrasVs.anterior', {
          mes: nombreMes(periodos.anterior.desde, locale),
        })}
      </span>
    </p>
  );
}

interface Props {
  filas: readonly FilaBarraComparada[];
  /** Nombre accesible de la lista. */
  etiqueta: string;
  /** Gráfico con lectura (ingresos): fila resaltada y gestos de puntero de la lista. */
  seleccion?: Pick<SeleccionGrafico, 'indice' | 'superficie'>;
}

/**
 * Cada categoría en tres líneas: el nombre; la barra de ESTE mes, gruesa y con su color, con el
 * importe grande y del mismo color a la derecha; y debajo la del mes anterior, fina y apagada, con
 * su importe pequeño y transparente. La anchura sale de los céntimos (dibujo, no dinero) y la escala
 * es el mayor importe de la lista. Los importes negativos no tienen barra.
 */
export function BarrasComparadas({ filas, etiqueta, seleccion }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const maximo = maximoAbsoluto(filas.flatMap((f) => [f.actual, f.anterior]));
  const ancho = (v: string) => (v.trim().startsWith('-') ? 0 : proporcion(v, maximo));
  const activa = seleccion?.indice;

  return (
    <ul
      aria-label={etiqueta}
      className={cx('flex flex-col gap-4 text-sm', seleccion && 'cursor-pointer touch-pan-y select-none')}
      {...(seleccion && {
        'data-testid': 'superficie-barras',
        ...seleccion.superficie,
      })}
    >
      {filas.map((f, i) => {
        const color = f.color ?? 'var(--color-acento)';
        return (
          <li
            key={f.id}
            aria-current={activa === i ? 'true' : undefined}
            className={cx('flex flex-col gap-1.5 transition-opacity', activa !== undefined && activa !== i && 'opacity-70')}
          >
            {f.href === undefined ? (
              <span className={cx('break-words text-texto', activa === i && 'font-semibold')}>{f.nombre}</span>
            ) : (
              <Link
                to={f.href}
                title={t('filas.verMovimientos', { nombre: f.nombre })}
                className="inline-flex items-center gap-0.5 self-start break-words text-texto hover:underline focus-visible:outline-2 focus-visible:outline-acento"
              >
                {f.nombre}
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-tenue" />
              </Link>
            )}
            <span className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <span aria-hidden="true" className="block h-3 rounded-full bg-borde">
                <span
                  className="block h-3 rounded-full"
                  style={{
                    width: `${ancho(f.actual)}%`,
                    backgroundColor: color,
                  }}
                />
              </span>
              <span
                data-testid="importe-actual"
                className={cx('cifras text-right text-base font-bold', f.actual.trim().startsWith('-') && 'text-negativo')}
                style={f.actual.trim().startsWith('-') ? undefined : { color }}
              >
                {formatearEuros(f.actual, locale)}
              </span>
              {f.anterior !== null && (
                <>
                  <span aria-hidden="true" className="block h-1 rounded-full bg-borde/60">
                    <span
                      className="block h-1 rounded-full opacity-35"
                      style={{
                        width: `${ancho(f.anterior)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </span>
                  <small data-testid="importe-anterior" className="cifras text-right text-xs opacity-60" style={{ color }}>
                    <span className="sr-only">{t('barrasVs.antes')} </span>
                    {formatearEuros(f.anterior, locale)}
                  </small>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
