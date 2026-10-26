import { useSyncExternalStore } from 'react';

/** Breakpoint `md` de Tailwind: por debajo, Configuración es una lista tipo Ajustes de iOS. */
export const CONSULTA_ESCRITORIO_CONFIG = '(min-width: 48rem)';

function consulta(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(CONSULTA_ESCRITORIO_CONFIG)
    : null;
}

function suscribir(aviso: () => void): () => void {
  const mq = consulta();
  if (mq === null) return () => undefined;
  mq.addEventListener('change', aviso);
  return () => mq.removeEventListener('change', aviso);
}

/** ¿Pantalla ancha? Sin matchMedia (tests, SSR) se trata como escritorio: todo en una página. */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => consulta()?.matches ?? true,
    () => true,
  );
}
