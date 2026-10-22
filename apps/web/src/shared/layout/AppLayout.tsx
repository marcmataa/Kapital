import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useT } from '@/shared/i18n';
import { ErrorBoundary, PantallaCarga } from '@/shared/ui';
import { BottomNav } from './BottomNav';
import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';

/**
 * Layout de la app con sesión. Escritorio (≥ lg): sidebar. Móvil: cabecera fija + bottom nav.
 * Todo por breakpoints CSS: no hay media queries en JS (evita parpadeos al cargar).
 */
export function AppLayout() {
  const t = useT('common');
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-toast) focus:rounded-lg focus:bg-acento focus:px-3 focus:py-2 focus:text-sobre-acento"
      >
        {t('nav.saltarContenido')}
      </a>
      <Sidebar className="hidden lg:flex" />
      <MobileHeader className="lg:hidden" />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 pt-[calc(var(--alto-header-movil)+env(safe-area-inset-top)+1rem)] pb-[calc(var(--alto-bottom-nav)+env(safe-area-inset-bottom)+1.5rem)] focus:outline-none sm:px-6 lg:px-8 lg:pt-8 lg:pb-10"
      >
        {/* key: al cambiar de página se recupera de un error anterior. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PantallaCarga />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <BottomNav className="lg:hidden" />
    </div>
  );
}
