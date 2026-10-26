import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeftRight, Receipt, Scale, Undo2, Wallet } from 'lucide-react';
import type { Categoria } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { TIPOS, type TipoMovimiento } from '../lib/tipos';

/** Flechas ←/→ (y ↑/↓) mueven la selección en un radiogroup; solo la opción activa es tabulable. */
function useRoving(total: number, elegir: (i: number) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const mover = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0 || total === 0) return;
    e.preventDefault();
    const siguiente = (i + delta + total) % total;
    elegir(siguiente);
    refs.current[siguiente]?.focus();
  };
  const registrar = (i: number) => (el: HTMLButtonElement | null) => {
    refs.current[i] = el;
  };
  return { mover, registrar };
}

const ICONO_TIPO: Record<TipoMovimiento, typeof Receipt> = {
  gasto: Receipt,
  ingreso: Wallet,
  devolucion: Undo2,
  traspaso: ArrowLeftRight,
  ajuste: Scale,
};

interface PropsTipo {
  valor: TipoMovimiento;
  onChange: (tipo: TipoMovimiento) => void;
  deshabilitado?: boolean;
}

/**
 * Tipo de movimiento con etiquetas completas («Devolución») e icono. En móvil se desliza en
 * horizontal si no cabe (nada de abreviaturas).
 */
export function SelectorTipo({ valor, onChange, deshabilitado = false }: PropsTipo) {
  const t = useT('movimientos');
  const { mover, registrar } = useRoving(TIPOS.length, (i) => {
    const tipo = TIPOS[i];
    if (tipo !== undefined && !deshabilitado) onChange(tipo);
  });
  return (
    <div
      role="radiogroup"
      aria-label={t('tipo.etiqueta')}
      aria-disabled={deshabilitado || undefined}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      {TIPOS.map((tipo, i) => {
        const Icono = ICONO_TIPO[tipo];
        const activo = tipo === valor;
        return (
          <button
            key={tipo}
            ref={registrar(i)}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo ? 0 : -1}
            onClick={() => {
              if (!deshabilitado) onChange(tipo);
            }}
            onKeyDown={(e) => mover(e, i)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:flex-1 sm:justify-center sm:px-2',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
              activo
                ? 'border-acento bg-acento text-sobre-acento'
                : 'border-borde-input text-texto hover:bg-superficie-2',
              deshabilitado && !activo && 'opacity-50',
            )}
          >
            <Icono aria-hidden="true" className="size-4 shrink-0" />
            {t(`tipo.${tipo}`)}
          </button>
        );
      })}
    </div>
  );
}

interface PropsCategoria {
  etiqueta: string;
  categorias: readonly Categoria[];
  valor: string;
  onChange: (id: string) => void;
  /** Categoría sugerida por el concepto (se marca con «Sugerida»). */
  sugerida?: string | null;
  error?: string | undefined;
  ayuda?: ReactNode;
}

const COLOR_HEX = /^#[0-9a-f]{6}$/i;

/** Cuadrícula de chips de categoría con su icono (radiogroup). El orden lo decide quien la usa. */
export function SelectorCategoria({ etiqueta, categorias, valor, onChange, sugerida = null, error, ayuda }: PropsCategoria) {
  const t = useT('movimientos');
  const nombre = useNombreCategoria();
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const { mover, registrar } = useRoving(categorias.length, (i) => {
    const c = categorias[i];
    if (c) onChange(c.id);
  });
  // Si no hay ninguna elegida, la primera es la que recibe el foco con Tab.
  const tabulable = categorias.some((c) => c.id === valor) ? valor : categorias[0]?.id;
  const describe = [ayuda !== undefined ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-etiqueta`} className="text-sm font-medium text-texto">
        {etiqueta}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-etiqueta`}
        aria-describedby={describe || undefined}
        aria-invalid={error ? true : undefined}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {categorias.map((c, i) => {
          const activa = c.id === valor;
          const color = COLOR_HEX.test(c.color) ? c.color : null;
          return (
            <button
              key={c.id}
              ref={registrar(i)}
              type="button"
              role="radio"
              aria-checked={activa}
              tabIndex={c.id === tabulable ? 0 : -1}
              onClick={() => onChange(c.id)}
              onKeyDown={(e) => mover(e, i)}
              className={cx(
                'flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                activa
                  ? 'border-acento bg-acento-suave font-semibold text-texto'
                  : 'border-borde-input text-texto hover:bg-superficie-2',
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-superficie-3 text-base leading-none"
                style={color ? { backgroundColor: `${color}2e`, color } : undefined}
              >
                {c.icono ?? Array.from(nombre(c))[0]?.toLocaleUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{nombre(c)}</span>
              {c.id === sugerida && (
                <span className="shrink-0 rounded-full bg-acento-suave px-1.5 text-[11px] font-medium text-acento">
                  {t('form.sugerida')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {ayuda !== undefined && !error && (
        <p id={idAyuda} className="text-xs text-apagado">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-xs font-medium text-negativo">
          {error}
        </p>
      )}
    </div>
  );
}
