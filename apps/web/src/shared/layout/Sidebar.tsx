import { NavLink } from 'react-router';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { BloqueCuenta } from './BloqueCuenta';
import { Logo } from './Logo';
import { NAV_ESCRITORIO } from './navegacion';

/** Menú lateral de escritorio (visible desde lg por CSS). */
export function Sidebar({ className }: { className?: string }) {
  const t = useT('common');
  return (
    <aside
      className={cx(
        'sticky top-0 h-dvh w-64 shrink-0 flex-col gap-6 border-r border-borde bg-nav px-4 py-6',
        className,
      )}
    >
      <Logo className="px-2" />
      <nav aria-label={t('nav.principal')} className="flex-1">
        <ul className="flex flex-col gap-1">
          {NAV_ESCRITORIO.map(({ ruta, clave, Icono, exacta }) => (
            <li key={ruta}>
              <NavLink
                to={ruta}
                end={exacta === true}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-nav-activo text-texto' : 'text-apagado hover:bg-superficie-2 hover:text-texto',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icono aria-hidden="true" className={cx('size-5', isActive && 'text-acento')} />
                    {t(clave)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <BloqueCuenta />
    </aside>
  );
}
