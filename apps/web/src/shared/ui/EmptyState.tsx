import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cx } from '@/shared/lib/cx';

interface Props {
  titulo: string;
  descripcion?: string;
  icono?: ReactNode;
  accion?: ReactNode;
  className?: string;
}

export function EmptyState({ titulo, descripcion, icono, accion, className }: Props) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <div
        className="flex size-12 items-center justify-center rounded-full bg-superficie-2 text-apagado"
        aria-hidden="true"
      >
        {icono ?? <Inbox className="size-6" />}
      </div>
      <p className="font-medium text-texto">{titulo}</p>
      {descripcion !== undefined && <p className="max-w-sm text-sm text-apagado">{descripcion}</p>}
      {accion}
    </div>
  );
}
