import { useIdioma } from '@/shared/i18n';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';

export interface FilaTop {
  id: string;
  /** Nombre ya traducido. */
  nombre: string;
  color: string;
  /** Importe de la categoría en el tramo (SQL, texto). */
  importe: string;
}

/**
 * Las 3 categorías con más importe (positivo) del tramo, de mayor a menor. Solo ordena y recorta
 * en céntimos `bigint`: no suma ni calcula dinero.
 */
export function top3(filas: readonly FilaTop[]): FilaTop[] {
  return filas
    .map((f) => ({ f, c: aCentimos(f.importe) }))
    .filter(({ c }) => c > 0n)
    .sort((a, b) => (a.c === b.c ? a.f.nombre.localeCompare(b.f.nombre) : a.c > b.c ? -1 : 1))
    .slice(0, 3)
    .map(({ f }) => f);
}

/** Top 3 de categorías bajo la cifra de una tarjeta de Inicio. Solo en escritorio (lg). */
export function TopCategorias({ titulo, filas }: { titulo: string; filas: readonly FilaTop[] }) {
  const { locale } = useIdioma();
  const top = top3(filas);
  if (top.length === 0) return null;
  return (
    <ul aria-label={titulo} className="mt-3 hidden flex-col gap-1.5 border-t border-borde pt-3 text-xs lg:flex">
      {top.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
            <span className="truncate text-texto">{f.nombre}</span>
          </span>
          <span className="cifras shrink-0 text-apagado">{formatearEuros(f.importe, locale)}</span>
        </li>
      ))}
    </ul>
  );
}
