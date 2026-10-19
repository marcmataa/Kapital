import type { ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';

export type TonoBadge = 'neutro' | 'acento' | 'positivo' | 'negativo' | 'aviso' | 'morado';

const TONOS: Record<TonoBadge, string> = {
  neutro: 'bg-superficie-2 text-apagado border-borde',
  acento: 'bg-acento-suave text-acento border-acento-borde',
  positivo: 'bg-positivo-suave text-positivo border-transparent',
  negativo: 'bg-negativo-suave text-negativo border-transparent',
  aviso: 'bg-aviso-suave text-aviso border-aviso-borde',
  morado: 'bg-morado-suave text-morado border-transparent',
};

interface Props {
  tono?: TonoBadge;
  icono?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tono = 'neutro', icono, children, className }: Props) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONOS[tono],
        className,
      )}
    >
      {icono}
      {children}
    </span>
  );
}
