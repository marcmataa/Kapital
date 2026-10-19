import { LoaderCircle } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

interface Props {
  /** Texto para lectores de pantalla. Por defecto «Cargando…». */
  etiqueta?: string;
  tamano?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TAMANOS = { sm: 'size-4', md: 'size-6', lg: 'size-10' } as const;

export function Spinner({ etiqueta, tamano = 'md', className }: Props) {
  const t = useT('common');
  return (
    <span role="status" className={cx('inline-flex items-center justify-center text-acento', className)}>
      <LoaderCircle aria-hidden="true" className={cx('animate-spin', TAMANOS[tamano])} />
      <span className="sr-only">{etiqueta ?? t('estado.cargando')}</span>
    </span>
  );
}

/** Spinner centrado (carga de rutas, sesión). */
export function PantallaCarga() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Spinner tamano="lg" />
    </div>
  );
}
