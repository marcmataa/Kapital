import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  titulo?: ReactNode;
  /** Acción en la cabecera (enlace «Ver todos», selector…). */
  accion?: ReactNode;
  /** Sin padding interno (listas a sangre). */
  sinPadding?: boolean;
  as?: 'section' | 'div' | 'article';
}

export function Card({
  titulo,
  accion,
  sinPadding = false,
  as: Etiqueta = 'section',
  className,
  children,
  ...resto
}: CardProps) {
  return (
    <Etiqueta
      className={cx(
        'rounded-2xl border border-borde bg-superficie shadow-tarjeta',
        !sinPadding && 'p-4 sm:p-5',
        className,
      )}
      {...resto}
    >
      {(titulo !== undefined || accion !== undefined) && (
        <header className={cx('mb-3 flex items-center justify-between gap-3', sinPadding && 'px-4 pt-4 sm:px-5 sm:pt-5')}>
          {titulo !== undefined && <h2 className="text-base font-semibold text-texto">{titulo}</h2>}
          {accion}
        </header>
      )}
      {children}
    </Etiqueta>
  );
}
