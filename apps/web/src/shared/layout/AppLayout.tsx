import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useT } from '@/shared/i18n';
import { ErrorBoundary, PantallaCarga } from '@/shared/ui';
import { BannerInstalar } from './BannerInstalar';
import { BottomNav } from './BottomNav';
import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';
import { useAtajosTeclado } from './useAtajosTeclado';

/**
 * Layout de la app con sesión. Escritorio (≥ lg): sidebar. Móvil: cabecera fija + bottom nav.
 * Todo por breakpoints CSS: no hay media queries en JS (evita parpadeos al cargar).
 * - Escritorio: el contenido empieza junto al menú (margen fijo de 40 px, sin centrar) y todas
 *   las páginas comparten el mismo ancho máximo (`max-w-contenido`, 1200 px).
 * - Móvil: padding inferior = barra inferior + botón «+» + safe-area, para que no tapen nada.
 */
export function AppLayout() {
  const t = useT('common');
  const { pathname } = useLocation();
  useAtajosTeclado();
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
        data-testid="contenido"
        className="w-full max-w-contenido min-w-0 flex-1 px-4 pt-[calc(var(--alto-header-movil)+env(safe-area-inset-top)+1rem)] pb-[calc(var(--alto-bottom-nav)+env(safe-area-inset-bottom)+2rem)] focus:outline-none sm:px-6 lg:px-10 lg:pt-8 lg:pb-10"
      >
        <BannerInstalar className="lg:hidden" />
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
