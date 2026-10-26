import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { NAV_MOVIMIENTOS, RUTA_NUEVO_MOVIMIENTO } from './navegacion';

/** Selector del buscador de Movimientos (el único `type="search"` de la página). */
export const SELECTOR_BUSQUEDA = '#contenido input[type="search"]';

/** ¿El foco está en un sitio donde se escribe? Ahí los atajos no actúan. */
function escribiendo(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const etiqueta = el.tagName;
  return etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT';
}

/** Hay un diálogo abierto (Sheet, confirmación…): los atajos no deben sacarte de él. */
function hayDialogo(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]') !== null;
}

/** Enfoca el buscador; si la página aún se está cargando (ruta lazy), lo reintenta un momento. */
function enfocarBusqueda(intentos = 40): void {
  const campo = document.querySelector<HTMLInputElement>(SELECTOR_BUSQUEDA);
  if (campo) {
    campo.focus();
    campo.select();
    return;
  }
  if (intentos > 0) window.setTimeout(() => enfocarBusqueda(intentos - 1), 50);
}

/**
 * Atajos de teclado de escritorio (sin modificadores y nunca mientras se escribe):
 * - `N`: nuevo movimiento.
 * - `/`: foco en la búsqueda de Movimientos (si no estás allí, te lleva).
 */
export function useAtajosTeclado(): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (escribiendo(e.target) || escribiendo(document.activeElement) || hayDialogo()) return;
      if (e.key === 'n' || e.key === 'N') {
        if (pathname === RUTA_NUEVO_MOVIMIENTO) return;
        e.preventDefault();
        void navigate(RUTA_NUEVO_MOVIMIENTO);
      } else if (e.key === '/') {
        e.preventDefault();
        if (pathname !== NAV_MOVIMIENTOS.ruta) void navigate(NAV_MOVIMIENTOS.ruta);
        enfocarBusqueda();
      }
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [navigate, pathname]);
}
