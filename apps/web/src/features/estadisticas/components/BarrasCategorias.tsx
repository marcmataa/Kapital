import { LOCALE_DE, useIdioma } from '@/shared/i18n';
import { formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';

export interface FilaBarra {
  id: string;
  nombre: string;
  color: string;
  importe: string;
  /** % con 4 decimales; null → «—». */
  porcentaje: string | null;
}

/**
 * Lista de barras horizontales «nombre · importe · %». La anchura sale del porcentaje
 * (coordenada de dibujo, no un cálculo de dinero). El texto lleva toda la información.
 */
export function BarrasCategorias({ filas, etiqueta }: { filas: readonly FilaBarra[]; etiqueta: string }) {
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  return (
    <ul aria-label={etiqueta} className="flex flex-col gap-3 text-sm">
      {filas.map((f) => (
        <li key={f.id} className="flex flex-col gap-1.5">
          <span className="flex justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
              <span className="truncate text-texto">{f.nombre}</span>
            </span>
            <span className="cifras shrink-0 text-texto">
              {formatearEuros(f.importe, locale)} · {formatearPorcentaje(f.porcentaje, locale)}
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
