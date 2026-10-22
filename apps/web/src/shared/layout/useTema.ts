import { useCallback, useSyncExternalStore } from 'react';
import { guardarLocal, leerLocal } from '@/shared/lib/almacenamiento';

/** Preferencia de tema de ESTE dispositivo (no se guarda en la base). */
export type Tema = 'oscuro' | 'claro' | 'sistema';

export const CLAVE_TEMA = 'kapital.tema';
const TEMA_POR_DEFECTO: Tema = 'oscuro';

function esTema(v: unknown): v is Tema {
  return v === 'oscuro' || v === 'claro' || v === 'sistema';
}

const oyentes = new Set<() => void>();
let actual: Tema = esTema(leerLocal(CLAVE_TEMA)) ? (leerLocal(CLAVE_TEMA) as Tema) : TEMA_POR_DEFECTO;

/** Aplica el tema al <html>: data-theme dark/light, o sin atributo para seguir al sistema. */
export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', tema === 'oscuro' ? 'dark' : 'light');
}

export function cambiarTema(tema: Tema): void {
  actual = tema;
  guardarLocal(CLAVE_TEMA, tema);
  aplicarTema(tema);
  oyentes.forEach((o) => o());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Tema actual + setter, sincronizado entre componentes. */
export function useTema(): { tema: Tema; setTema: (tema: Tema) => void; alternar: () => void } {
  const tema = useSyncExternalStore(
    suscribir,
    () => actual,
    () => TEMA_POR_DEFECTO,
  );
  const alternar = useCallback(() => {
    const oscuroEfectivo =
      actual === 'oscuro' || (actual === 'sistema' && !window.matchMedia('(prefers-color-scheme: light)').matches);
    cambiarTema(oscuroEfectivo ? 'claro' : 'oscuro');
  }, []);
  return { tema, setTema: cambiarTema, alternar };
}

/** Llamar una vez al arrancar (main.tsx). */
export function iniciarTema(): void {
  aplicarTema(actual);
}
