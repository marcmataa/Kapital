import type { ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';

interface Props {
  titulo: string;
  /** Valor ya formateado. */
  valor: string;
  /** Color del valor (p. ej. balance negativo en rojo). */
  tono?: 'neutro' | 'positivo' | 'negativo';
  children?: ReactNode;
  className?: string;
}

const TONO = { neutro: 'text-texto', positivo: 'text-positivo', negativo: 'text-negativo' } as const;

/** Tarjeta de cifra con título, valor grande y líneas de detalle. */
export function TarjetaCifra({ titulo, valor, tono = 'neutro', children, className }: Props) {
  return (
    <article
      className={cx(
        'flex min-w-0 flex-col gap-1.5 rounded-2xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5',
        className,
      )}
    >
      <h3 className="text-sm text-apagado">{titulo}</h3>
      <p className={cx('cifras truncate text-2xl font-bold tracking-tight sm:text-[1.65rem]', TONO[tono])}>{valor}</p>
      {children}
    </article>
  );
}
