import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
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
  /** Leyenda «Este mes / Mes anterior» encima de las barras dobles (por defecto, sí). */
  leyenda?: boolean;
  className?: string;
}

/**
 * Qué es cada marca: la barra es este mes (con el color de cada categoría, así que la muestra
 * lleva los colores de las primeras filas) y la raya vertical, el mes anterior.
 */
function Leyenda({ colores }: { colores: readonly string[] }) {
  const t = useT('common');
  const muestra =
    colores.length > 0 ? { background: `linear-gradient(to right, ${colores.join(', ')})` } : undefined;
  return (
    <p aria-hidden="true" data-testid="leyenda-comparada" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-apagado">
      <span className="flex items-center gap-1.5">
        <span className={cx('block h-2 w-5 rounded', muestra === undefined && 'bg-acento')} style={muestra} />
        {t('grafico.esteMes')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="block h-3 w-0.5 rounded-full bg-texto" />
        {t('grafico.mesAnterior')}
      </span>
    </p>
  );
}

/**
 * Filas «este periodo vs el anterior» en dos líneas, para que el nombre se lea entero también en
 * el móvil: arriba el nombre y los importes (este mes y, apagado, el anterior); debajo, a todo el
 * ancho, la barra de este mes y una raya vertical donde llegó el anterior (estilo «objetivo»).
 * La anchura sale de los céntimos (dibujo, no dinero). Los importes negativos se muestran en
 * negativo y sin barra.
 */
export function FilasComparadas({ filas, etiqueta, etiquetaAnterior, leyenda = true, className }: Props) {
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const maximo = maximoAbsoluto(filas.flatMap((f) => (f.total ? [] : [f.actual, f.anterior])));
  const ancho = (v: string) => (v.trim().startsWith('-') ? 0 : proporcion(v, maximo));
  const hayDobles = filas.some((f) => !f.total && f.anterior !== null);
  const colores = filas.flatMap((f) => (f.total || f.color === undefined ? [] : [f.color])).slice(0, 3);

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      {leyenda && hayDobles && <Leyenda colores={colores} />}
      <ul aria-label={etiqueta} className="flex flex-col gap-3.5 text-sm">
        {filas.map((f) => {
          const opciones = f.signo !== undefined ? { signo: f.signo } : {};
          return (
            <li key={f.id} className={cx('flex flex-col gap-1.5', f.total && 'font-semibold')}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {f.color !== undefined && (
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                  )}
                  <span className="break-words text-texto">{f.nombre}</span>
                </span>
                <span className="cifras flex shrink-0 items-baseline gap-2 text-right">
                  {f.anterior !== null && (
                    <small className="text-[13px] font-normal text-apagado">
                      <span className="sr-only">{etiquetaAnterior} </span>
                      {formatearEuros(f.anterior, locale, opciones)}
                    </small>
                  )}
                  <span className={cx('text-texto', f.actual.trim().startsWith('-') && f.signo === undefined && 'text-negativo')}>
                    {formatearEuros(f.actual, locale, opciones)}
                  </span>
                </span>
              </span>
              {!f.total && (
                <span aria-hidden="true" className="relative block h-2 rounded bg-borde">
                  <span
                    className="block h-2 rounded bg-acento"
                    style={{ width: `${ancho(f.actual)}%`, ...(f.color !== undefined && { backgroundColor: f.color }) }}
                  />
                  {f.anterior !== null && !f.anterior.trim().startsWith('-') && (
                    <span
                      data-testid="marca-anterior"
                      className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded-full bg-texto"
                      style={{ left: `${ancho(f.anterior)}%` }}
                    />
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
