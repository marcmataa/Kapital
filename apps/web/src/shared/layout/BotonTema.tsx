import { Moon, Sun } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { useTema } from './useTema';

/** Alterna claro/oscuro. Los dos iconos se pintan y CSS elige cuál ver (sin JS de media queries). */
export function BotonTema({ className }: { className?: string }) {
  const t = useT('common');
  const { alternar } = useTema();
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={t('tema.cambiar')}
      title={t('tema.cambiar')}
      className={cx(
        'inline-flex size-10 items-center justify-center rounded-xl border border-borde bg-superficie text-apagado transition-colors hover:text-texto',
        className,
      )}
    >
      <Moon aria-hidden="true" className="hidden size-5 in-data-[theme=light]:block" />
      <Sun aria-hidden="true" className="size-5 in-data-[theme=light]:hidden" />
    </button>
  );
}
