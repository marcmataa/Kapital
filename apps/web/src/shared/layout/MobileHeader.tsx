import { Link } from 'react-router';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { BotonTema } from './BotonTema';
import { Logo } from './Logo';

/** Cabecera fija del móvil (oculta desde lg por CSS). Respeta el notch con safe-area. */
export function MobileHeader({ className }: { className?: string }) {
  const t = useT('common');
  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-(--z-nav) border-b border-borde bg-nav/90 backdrop-blur',
        'pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]',
        className,
      )}
    >
      <div className="flex h-(--alto-header-movil) items-center justify-between">
        <Link to="/" aria-label={t('nav.inicio')}>
          <Logo />
        </Link>
        <BotonTema className="size-9" />
      </div>
    </header>
  );
}
