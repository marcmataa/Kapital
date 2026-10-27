import { aCentimos, desdeCentimos } from '@/shared/lib/dinero';
import { formatearDiaMes, partesDe } from '@/shared/lib/fechas';

/*
 * Cálculos puros de Inicio. Los importes se tratan como céntimos en bigint; solo se convierten a
 * `number` en `fraccion` (posiciones en píxeles), nunca para mostrar ni para operar con dinero.
 */

function valorAbsoluto(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/**
 * Posición relativa de `valor` en [min, max] como fracción 0..1, para píxeles.
 * Única conversión de importes a `number` permitida (coordenadas del gráfico).
 */
export function fraccion(valor: bigint, min: bigint, max: bigint): number {
  if (max === min) return 0.5;
  const escala = 1_000_000n;
  return Number(((valor - min) * escala) / (max - min)) / Number(escala);
}

/**
 * Porcentaje de `parte` sobre `total` con 4 decimales exactos (mitades alejándose de cero),
 * listo para `formatearPorcentaje`. null si el total no es positivo.
 */
export function porcentajeSobre(parte: string, total: string): string | null {
  const t = aCentimos(total);
  if (t <= 0n) return null;
  const numerador = aCentimos(parte) * 1_000_000n;
  let cociente = numerador / t;
  const resto = numerador % t;
  if (2n * valorAbsoluto(resto) >= t) cociente += numerador < 0n ? -1n : 1n;
  const negativo = cociente < 0n;
  const abs = valorAbsoluto(cociente);
  return `${negativo ? '-' : ''}${(abs / 10_000n).toString()}.${(abs % 10_000n).toString().padStart(4, '0')}`;
}

/** Diferencia exacta a − b de dos importes string. */
export function restarImportes(a: string, b: string): string {
  return desdeCentimos(aCentimos(a) - aCentimos(b));
}

/** Progreso de 0 a 100 (entero, para el ancho de una barra). Negativo → 0; más de 100 → 100. */
/** Geometría de la barra del objetivo de ahorro (en %, solo dibujo). */
export interface BarraAhorro {
  /** Dónde está el 0 (más de 0 si el balance es negativo). */
  cero: number;
  /** La barra va de `desde` a `desde + ancho`: a la derecha del 0 si es positivo, a la izquierda si no. */
  desde: number;
  ancho: number;
  /** Marca del objetivo. */
  objetivo: number;
}

/**
 * Barra tipo «bullet» del ahorro mensual (auditoría F21): el eje va del menor de (balance, 0) al
 * mayor de (objetivo, balance), así que un balance negativo se ve como una barra a la izquierda
 * del 0 en lugar de una barra vacía. Céntimos bigint; a `number` solo la coordenada final.
 */
export function barraAhorro(actual: string, objetivo: string): BarraAhorro {
  const a = aCentimos(actual);
  const o = aCentimos(objetivo);
  const min = a < 0n ? a : 0n;
  const max = [o, a, 0n].reduce((x, y) => (y > x ? y : x));
  const pos = (c: bigint) => (max <= min ? 0 : Number(((c - min) * 10_000n) / (max - min)) / 100);
  const cero = pos(0n);
  const fin = pos(a);
  return { cero, desde: Math.min(cero, fin), ancho: Math.abs(fin - cero), objetivo: pos(o) };
}

export function progresoBarra(actual: string, objetivo: string): number {
  const o = aCentimos(objetivo);
  if (o <= 0n) return 0;
  const a = aCentimos(actual);
  if (a <= 0n) return 0;
  if (a >= o) return 100;
  return Number((a * 100n) / o);
}

// ---------------------------------------------------------------- Formato de fechas y ejes

function fechaUtc(fecha: string): Date {
  const { anio, mes, dia } = partesDe(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** '2026-10-15' → '15 oct' (es) / '15 Oct' (en): el formateador de fecha corta de toda la app. */
export { formatearDiaMes };

/** '2026-10-15' → 'oct' (es). */
export function mesCorto(fecha: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(fechaUtc(fecha));
}

/** '2026-10-15' → 'octubre' (es). */
export function mesLargo(fecha: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(fechaUtc(fecha));
}

/** 'octubre' → 'Octubre'. */
export function capitalizar(texto: string, locale: string): string {
  return texto.charAt(0).toLocaleUpperCase(locale) + texto.slice(1);
}
