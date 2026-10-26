import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { LecturaGrafico } from '@/shared/ui';

export interface FilaBarra {
  id: string;
  nombre: string;
  color: string;
  importe: string;
  /** % con 4 decimales; null → «—». */
  porcentaje: string | null;
}

interface Props {
  filas: readonly FilaBarra[];
  etiqueta: string;
}

/**
 * Lista de barras horizontales «nombre · importe · %». La anchura sale del porcentaje
 * (coordenada de dibujo, no un cálculo de dinero). El texto lleva toda la información.
 * Se recorre categoría a categoría pasando el ratón, tocando con el dedo (`touch-action: pan-y`:
 * el desplazamiento vertical de la página sigue funcionando) o con ↑/↓ desde el control.
 */
export function BarrasCategorias({ filas, etiqueta }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: filas.length, inicial: 0, eje: 'y' });
  const elegida = filas[indice];
  const valor = (f: FilaBarra) => formatearEuros(f.importe, locale);
  const detalle = (f: FilaBarra) => t('barras.porcentaje', { porcentaje: formatearPorcentaje(f.porcentaje, locale) });

  return (
    <div className="flex flex-col gap-3">
      {elegida && (
        <LecturaGrafico data-testid="lectura-barras" titulo={elegida.nombre} valor={valor(elegida)}>
          <span className="cifras text-xs text-apagado sm:text-sm">{detalle(elegida)}</span>
        </LecturaGrafico>
      )}
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('barras.control', { grafico: etiqueta })}
        aria-valuemin={1}
        aria-valuemax={filas.length}
        aria-valuenow={indice + 1}
        aria-valuetext={elegida ? `${elegida.nombre} · ${valor(elegida)} · ${detalle(elegida)}` : undefined}
        onKeyDown={alTeclado}
        className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
      >
        <ul
          aria-label={etiqueta}
          data-testid="superficie-barras"
          className="flex cursor-pointer touch-pan-y flex-col gap-3 text-sm select-none"
          {...superficie}
        >
          {filas.map((f, i) => (
            <li
              key={f.id}
              aria-current={i === indice ? 'true' : undefined}
              className={cx('flex flex-col gap-1.5 transition-opacity', i !== indice && 'opacity-70')}
            >
              <span className="flex justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                  <span title={f.nombre} className={cx('truncate text-texto', i === indice && 'font-semibold')}>
                    {f.nombre}
                  </span>
                </span>
                <span className="cifras shrink-0 text-texto">
                  {valor(f)} · {formatearPorcentaje(f.porcentaje, locale)}
                </span>
              </span>
              <span aria-hidden="true" className="block h-2 rounded bg-borde">
                <span
                  className="block h-2 rounded"
                  style={{ width: `${anchura(f.porcentaje)}%`, backgroundColor: f.color }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** '29.1234' → 29.12 (solo para dibujar), acotado a [0, 100]. */
function anchura(porcentaje: string | null): number {
  if (porcentaje === null) return 0;
  const m = /^(-?)(\d+)(?:\.(\d{0,2}))?/.exec(porcentaje);
  if (!m || m[1] === '-') return 0;
  const centesimas = BigInt(m[2] ?? '0') * 100n + BigInt((m[3] ?? '').padEnd(2, '0'));
  const acotado = centesimas > 10_000n ? 10_000n : centesimas;
  return Number(acotado) / 100;
}
