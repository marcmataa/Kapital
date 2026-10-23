import { LOCALE_DE, useIdioma } from '@/shared/i18n';
import { formatearEuros, type OpcionesEuros } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { maximoAbsoluto, proporcion, type FilaComparada } from '../lib/agregaciones';

export interface FilaVista extends FilaComparada {
  /** Fila de total (en negrita, sin color propio). */
  total?: boolean;
  /** Signo con que se formatean los importes (p. ej. un ajuste que resta). */
  signo?: OpcionesEuros['signo'];
}

interface Props {
  filas: readonly FilaVista[];
  /** Nombre accesible de la lista. */
  etiqueta: string;
  /** Texto de la línea del periodo anterior para lectores de pantalla («antes»). */
  etiquetaAnterior: string;
  className?: string;
}

/**
 * Filas «este periodo vs el anterior», como las «Categorías: este mes vs anterior» de la PWA
 * antigua: nombre, barra del periodo actual con su importe y, debajo, una barra fina y apagada del
 * periodo anterior con el suyo. La anchura sale de los céntimos (dibujo, no dinero). Los
 * importes negativos se muestran en negativo y sin barra.
 */
export function FilasComparadas({ filas, etiqueta, etiquetaAnterior, className }: Props) {
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const maximo = maximoAbsoluto(filas.flatMap((f) => (f.total ? [] : [f.actual, f.anterior])));
  const ancho = (v: string) => (v.trim().startsWith('-') ? 0 : proporcion(v, maximo));

  return (
    <ul aria-label={etiqueta} className={cx('flex flex-col gap-3 text-sm', className)}>
      {filas.map((f) => {
        const opciones = f.signo !== undefined ? { signo: f.signo } : {};
        return (
          <li
            key={f.id}
            className={cx(
              'grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-x-3',
              f.total && 'font-semibold',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {f.color !== undefined && (
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
              )}
              <span className="truncate text-texto">{f.nombre}</span>
            </span>
            <span aria-hidden="true" className="flex flex-col gap-1">
              {!f.total && (
                <>
                  <span className="block h-2 rounded bg-borde">
                    <span
                      className="block h-2 rounded bg-acento"
                      style={{ width: `${ancho(f.actual)}%`, ...(f.color !== undefined && { backgroundColor: f.color }) }}
                    />
                  </span>
                  {f.anterior !== null && (
                    <span className="block h-[5px] rounded bg-borde opacity-45">
                      <span
                        className="block h-[5px] rounded bg-acento"
                        style={{ width: `${ancho(f.anterior)}%`, ...(f.color !== undefined && { backgroundColor: f.color }) }}
                      />
                    </span>
                  )}
                </>
              )}
            </span>
            <span className="cifras flex flex-col items-end text-right">
              <span className={cx('text-texto', f.actual.trim().startsWith('-') && f.signo === undefined && 'text-negativo')}>
                {formatearEuros(f.actual, locale, opciones)}
              </span>
              {f.anterior !== null && (
                <small className="text-xs font-normal text-apagado">
                  <span className="sr-only">{etiquetaAnterior} </span>
                  {formatearEuros(f.anterior, locale, opciones)}
                </small>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
