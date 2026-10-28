import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx } from '@/shared/lib/cx';

export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';
export type TamanoBoton = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Muestra un spinner, desactiva el botón y marca aria-busy. */
  cargando?: boolean;
  icono?: ReactNode;
  anchoCompleto?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-acento text-sobre-acento hover:bg-acento-hover',
  secundario: 'bg-superficie-2 text-texto border border-borde hover:bg-superficie-3',
  fantasma: 'bg-transparent text-texto hover:bg-superficie-2',
  peligro: 'bg-negativo text-sobre-negativo hover:opacity-90',
};

const TAMANOS: Record<TamanoBoton, string> = {
  // 32 px a la vista; 44 px pulsables con el dedo (area-tactil, F27).
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg area-tactil',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

/** Clases de botón, para usarlas también en <Link> con aspecto de botón. */
export function clasesBoton(variante: VarianteBoton = 'primario', tamano: TamanoBoton = 'md', anchoCompleto = false) {
  return cx(
    'inline-flex items-center justify-center font-medium transition-colors select-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTES[variante],
    TAMANOS[tamano],
    anchoCompleto && 'w-full',
  );
}

export function Button({
  variante = 'primario',
  tamano = 'md',
  cargando = false,
  icono,
  anchoCompleto = false,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...resto
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled === true || cargando}
      aria-busy={cargando || undefined}
      className={cx(clasesBoton(variante, tamano, anchoCompleto), className)}
      {...resto}
    >
      {cargando ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : icono}
      {children}
    </button>
  );
}
