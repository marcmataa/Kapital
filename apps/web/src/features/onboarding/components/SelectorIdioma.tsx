import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { IDIOMAS, useT, type Idioma } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

interface Props {
  /** Nombre accesible del grupo. */
  etiqueta: string;
  valor: Idioma;
  onCambio: (idioma: Idioma) => void;
}

/** Lista de idiomas con semántica de radiogroup (flechas para moverse, solo el activo es tabulable). */
export function SelectorIdioma({ etiqueta, valor, onCambio }: Props) {
  const tc = useT('common');
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  const mover = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const delta =
      e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const siguiente = (indice + delta + IDIOMAS.length) % IDIOMAS.length;
    const idioma = IDIOMAS[siguiente];
    if (!idioma) return;
    onCambio(idioma);
    botones.current[siguiente]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-col gap-2.5">
      {IDIOMAS.map((idioma, i) => {
        const activo = idioma === valor;
        return (
          <button
            key={idioma}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo ? 0 : -1}
            lang={idioma}
            onClick={() => onCambio(idioma)}
            onKeyDown={(e) => mover(e, i)}
            className={cx(
              'flex h-14 items-center justify-between rounded-xl border-2 px-4 text-left text-base text-texto transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
              activo
                ? 'border-acento bg-acento-suave font-semibold'
                : 'border-borde bg-superficie hover:border-borde-fuerte',
            )}
          >
            {tc(`idioma.${idioma}`)}
            {activo && <Check aria-hidden="true" className="size-5 text-acento" />}
          </button>
        );
      })}
    </div>
  );
}
