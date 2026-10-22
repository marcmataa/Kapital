import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  /** Pie fijo (botones de acción). */
  pie?: ReactNode;
  className?: string;
}

const SELECTOR_FOCO =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hoja inferior en móvil y modal centrado desde `sm` (solo CSS, sin media queries en JS).
 * Escape y clic fuera cierran; el foco queda atrapado dentro y vuelve al disparador al cerrar.
 */
export function Sheet({ abierto, onCerrar, titulo, children, pie, className }: Props) {
  const t = useT('common');
  const idTitulo = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(onCerrar);

  useEffect(() => {
    cerrarRef.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const primero = panel.current?.querySelector<HTMLElement>(SELECTOR_FOCO);
    (primero ?? panel.current)?.focus();

    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrarRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const focos = Array.from(panel.current.querySelectorAll<HTMLElement>(SELECTOR_FOCO));
      const inicio = focos[0];
      const fin = focos[focos.length - 1];
      if (!inicio || !fin) return;
      if (e.shiftKey && document.activeElement === inicio) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        inicio.focus();
      }
    };
    document.addEventListener('keydown', alPulsar);
    return () => {
      document.removeEventListener('keydown', alPulsar);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  return createPortal(
    <div className="fixed inset-0 z-(--z-sheet) flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" aria-hidden="true" onClick={onCerrar} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col border border-borde bg-superficie shadow-tarjeta',
          'rounded-t-3xl pb-[env(safe-area-inset-bottom)] sm:max-w-lg sm:rounded-2xl sm:pb-0',
          className,
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-borde px-5 py-4">
          <h2 id={idTitulo} className="text-lg font-semibold text-texto">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('accion.cerrar')}
            className="rounded-lg p-1.5 text-apagado transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {pie !== undefined && <footer className="border-t border-borde px-5 py-4">{pie}</footer>}
      </div>
    </div>,
    document.body,
  );
}
