import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';

export interface OpcionSegmento<V extends string> {
  valor: V;
  etiqueta: ReactNode;
}

interface Props<V extends string> {
  /** Nombre accesible del grupo («Tipo de movimiento»). */
  etiqueta: string;
  opciones: readonly OpcionSegmento<V>[];
  valor: V;
  onChange: (valor: V) => void;
  tamano?: 'sm' | 'md';
  anchoCompleto?: boolean;
  className?: string;
}

/**
 * Selector de pestañas tipo «Gastos | Ingresos | Devoluciones».
 * Semántica de radiogroup: flechas izquierda/derecha cambian la opción, solo la activa es tabulable.
 */
export function SegmentedControl<V extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
  tamano = 'md',
  anchoCompleto = false,
  className,
}: Props<V>) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  const mover = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const siguiente = (indice + delta + opciones.length) % opciones.length;
    const opcion = opciones[siguiente];
    if (!opcion) return;
    onChange(opcion.valor);
    botones.current[siguiente]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className={cx(
        'inline-flex gap-1 rounded-xl border border-borde bg-superficie-2 p-1',
        anchoCompleto && 'flex w-full',
        className,
      )}
    >
      {opciones.map((opcion, i) => {
        const activa = opcion.valor === valor;
        return (
          <button
            key={opcion.valor}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={activa ? 0 : -1}
            onClick={() => onChange(opcion.valor)}
            onKeyDown={(e) => mover(e, i)}
            className={cx(
              'rounded-lg font-medium whitespace-nowrap transition-colors',
              tamano === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
              anchoCompleto && 'flex-1',
              activa ? 'bg-acento text-sobre-acento shadow-sm' : 'text-apagado hover:text-texto',
            )}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
