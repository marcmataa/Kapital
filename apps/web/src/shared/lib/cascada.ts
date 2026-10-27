import { aCentimos } from './dinero';

/** Fracción (0–1) de `c` entre `min` y `max`, con céntimos bigint: solo es una coordenada. */
function fraccion(c: bigint, min: bigint, max: bigint): number {
  if (max <= min) return 0;
  return Number(((c - min) * 10_000n) / (max - min)) / 10_000;
}

export interface TramoCascada<T> {
  paso: T;
  /** Tramo horizontal en % desde la izquierda: empieza en `abajo` y mide `alto` (mínimo visible 0,6 %). */
  abajo: number;
  alto: number;
  /** Posición (%) donde termina el paso: de ahí sale la línea que lo une con el siguiente. */
  fin: number;
}

/**
 * Geometría de una cascada a partir de los acumulados exactos de cada paso (inicio y fin, en
 * texto). El eje incluye siempre el 0: lo que queda en negativo se dibuja a la izquierda de la
 * línea del cero. Solo coordenadas de dibujo, nunca dinero.
 */
export function geometriaCascada<T extends { inicio: string; fin: string }>(
  pasos: readonly T[],
): { tramos: TramoCascada<T>[]; cero: number } {
  const valores = pasos.flatMap((p) => [aCentimos(p.inicio), aCentimos(p.fin)]);
  const min = valores.reduce((a, b) => (b < a ? b : a), 0n);
  const max = valores.reduce((a, b) => (b > a ? b : a), 0n);
  const tramos = pasos.map((paso) => {
    const a = fraccion(aCentimos(paso.inicio), min, max) * 100;
    const b = fraccion(aCentimos(paso.fin), min, max) * 100;
    return { paso, abajo: Math.min(a, b), alto: Math.max(Math.abs(b - a), 0.6), fin: b };
  });
  return { tramos, cero: fraccion(0n, min, max) * 100 };
}
