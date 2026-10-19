import { Link, NavLink, useLocation } from 'react-router';
import { Ellipsis, Plus } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { NAV_ESTADISTICAS, NAV_INICIO, NAV_MAS, NAV_MOVIMIENTOS, RUTA_NUEVO_MOVIMIENTO, type ItemNav } from './navegacion';

const claseItem = (activo: boolean) =>
  cx(
    'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
    activo ? 'text-acento' : 'text-apagado hover:text-texto',
  );

function Item({ item }: { item: ItemNav }) {
  const t = useT('common');
  const { Icono } = item;
  const location = useLocation();
  // /movimientos/nuevo tiene su propio botón: ahí no se marca «Movimientos».
  const excluido = item.ruta === NAV_MOVIMIENTOS.ruta && location.pathname === RUTA_NUEVO_MOVIMIENTO;
  return (
    <NavLink
      to={item.ruta}
      end={item.exacta === true || excluido}
      className={({ isActive }) => claseItem(isActive && !excluido)}
    >
      <Icono aria-hidden="true" className="size-5" />
      <span>{t(item.clave)}</span>
    </NavLink>
  );
}

/** Navegación inferior del móvil (oculta desde lg por CSS). Botón central «+» para añadir un movimiento. */
export function BottomNav({ className }: { className?: string }) {
  const t = useT('common');
  const { pathname } = useLocation();
  const masActivo =
    pathname === '/mas' || NAV_MAS.some((i) => pathname === i.ruta || pathname.startsWith(`${i.ruta}/`));
  const nuevoActivo = pathname === RUTA_NUEVO_MOVIMIENTO;

  return (
    <nav
      aria-label={t('nav.principal')}
      className={cx(
        'fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-borde bg-nav/95 backdrop-blur',
        'pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
        className,
      )}
    >
      <ul className="flex h-(--alto-bottom-nav) items-stretch">
        <li className="flex flex-1">
          <Item item={NAV_INICIO} />
        </li>
        <li className="flex flex-1">
          <Item item={NAV_MOVIMIENTOS} />
        </li>
        <li className="flex flex-1 items-center justify-center">
          <Link
            to={RUTA_NUEVO_MOVIMIENTO}
            aria-label={t('nav.nuevoMovimiento')}
            aria-current={nuevoActivo ? 'page' : undefined}
            className="flex size-12 -translate-y-3 items-center justify-center rounded-full bg-acento text-sobre-acento shadow-lg shadow-acento/30 ring-4 ring-fondo transition-colors hover:bg-acento-hover"
          >
            <Plus aria-hidden="true" className="size-6" />
          </Link>
        </li>
        <li className="flex flex-1">
          <Item item={NAV_ESTADISTICAS} />
        </li>
        <li className="flex flex-1">
          <Link to="/mas" aria-current={masActivo ? 'page' : undefined} className={claseItem(masActivo)}>
            <Ellipsis aria-hidden="true" className="size-5" />
            <span>{t('nav.mas')}</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
