import { aCentimos, desdeCentimos } from '@/shared/lib/dinero';
import { formatearDiaMes, partesDe } from '@/shared/lib/fechas';

/*
 * Cálculos puros de Inicio. Los importes se tratan como céntimos en bigint; solo se convierten a
 * `number` en `fraccion` (posiciones en píxeles), nunca para mostrar ni para operar con dinero.
 */

function valorAbsoluto(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/** División entera redondeando hacia −∞ (la de bigint trunca hacia 0). */
function dividirHaciaAbajo(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

function dividirHaciaArriba(a: bigint, b: bigint): bigint {
  return -dividirHaciaAbajo(-a, b);
}

/** Paso «bonito» ≥ `bruto` de la forma {1, 2, 5} × 10^k céntimos, con un mínimo de 1 € (100). */
function pasoBonito(bruto: bigint): bigint {
  let potencia = 100n;
  for (;;) {
    for (const factor of [1n, 2n, 5n]) {
      if (factor * potencia >= bruto) return factor * potencia;
    }
    potencia *= 10n;
  }
}

export interface EscalaEje {
  /** Límite inferior del eje (céntimos). */
  min: bigint;
  /** Límite superior del eje (céntimos). */
  max: bigint;
  /** Distancia entre marcas (céntimos, euros enteros). */
  paso: bigint;
  /** Marcas de min a max, todas a la misma distancia. */
  ticks: bigint[];
}

/**
 * Eje Y del gráfico de capital: escalones iguales sobre valores redondos ajustados a los datos
 * (no empieza en 0). Todas las marcas son euros enteros para poder mostrarlas sin decimales.
 *   escalaEje(180000n, 245832n) → 1.800 €, 2.000 €, 2.200 €, 2.400 €, 2.600 €
 */
export function escalaEje(minCentimos: bigint, maxCentimos: bigint, objetivoTicks = 5): EscalaEje {
  const lo = minCentimos <= maxCentimos ? minCentimos : maxCentimos;
  const hi = minCentimos <= maxCentimos ? maxCentimos : minCentimos;
  const intervalos = BigInt(Math.max(1, Math.trunc(objetivoTicks) - 1));
  let rango = hi - lo;
  if (rango === 0n) {
    // Serie plana: un rango alrededor del valor (10 % de su magnitud, mínimo 10 €).
    const magnitud = valorAbsoluto(hi) / 10n;
    rango = magnitud > 1000n ? magnitud : 1000n;
  }
  const paso = pasoBonito(dividirHaciaArriba(rango, intervalos));
  let min = dividirHaciaAbajo(lo, paso) * paso;
  let max = dividirHaciaArriba(hi, paso) * paso;
  if (min === max) {
    min -= paso;
    max += paso;
  }
  const ticks: bigint[] = [];
  for (let v = min; v <= max; v += paso) ticks.push(v);
  return { min, max, paso, ticks };
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

/** Etiqueta del eje Y: euros enteros sin decimales ('2.600 €'). Exacto: formatea el string. */
export function formatearEurosEje(centimos: bigint, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: 'always',
  }).format(desdeCentimos(centimos) as Intl.StringNumericLiteral);
}
