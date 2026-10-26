import { aCentimos, desdeCentimos } from './dinero';

/*
 * Ejes de los gráficos con números redondos («nice max»): 0 / 100 / 200 / 300 €, nunca
 * 0 / 134,17 / 268,35 €. Todo en céntimos `bigint`: los importes llegan como string y solo se
 * convierten a `number` en `posicionEnEje` (coordenadas de dibujo, nunca dinero).
 */

export interface EscalaEje {
  /** Límite inferior del eje (céntimos, euros enteros). */
  min: bigint;
  /** Límite superior del eje (céntimos, euros enteros). */
  max: bigint;
  /** Distancia entre marcas (céntimos, euros enteros). */
  paso: bigint;
  /** Marcas de `min` a `max`, todas a la misma distancia. Si el eje cruza el cero, una es 0. */
  ticks: bigint[];
}

export interface OpcionesEscala {
  /** Número máximo de marcas (incluidos los extremos). Por defecto 4: 0 / 100 / 200 / 300. */
  marcas?: number;
  /** El eje incluye el 0 (barras). Por defecto true. Una línea de patrimonio puede no incluirlo. */
  incluirCero?: boolean;
}

const abs = (n: bigint) => (n < 0n ? -n : n);

/** División entera redondeando hacia −∞ (la de bigint trunca hacia 0). */
function haciaAbajo(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

function haciaArriba(a: bigint, b: bigint): bigint {
  return -haciaAbajo(-a, b);
}

/** Pasos redondos {1, 2, 5} × 10^k céntimos, empezando en 1 € (100 céntimos). */
function* pasosRedondos(): Generator<bigint> {
  for (let potencia = 100n; ; potencia *= 10n) {
    yield potencia;
    yield 2n * potencia;
    yield 5n * potencia;
  }
}

/**
 * Escala con números redondos para un rango de céntimos. Elige el paso redondo más pequeño con el
 * que el rango cabe en `marcas − 1` intervalos.
 *   escalaRedonda(0n, 27000n)        → 0, 100, 200, 300 €
 *   escalaRedonda(-8000n, 150800n)   → -1.000, 0, 1.000, 2.000 €
 *   escalaRedonda(180000n, 245832n, { incluirCero: false }) → 1.500, 2.000, 2.500 €
 */
export function escalaRedonda(minCentimos: bigint, maxCentimos: bigint, opciones: OpcionesEscala = {}): EscalaEje {
  const marcas = Math.max(2, Math.trunc(opciones.marcas ?? 4));
  const intervalos = BigInt(marcas - 1);
  const incluirCero = opciones.incluirCero ?? true;
  let lo = minCentimos <= maxCentimos ? minCentimos : maxCentimos;
  let hi = minCentimos <= maxCentimos ? maxCentimos : minCentimos;
  if (incluirCero) {
    if (lo > 0n) lo = 0n;
    if (hi < 0n) hi = 0n;
  }
  if (lo === hi) {
    // Serie plana (o todo a 0): un margen del 10 % de su magnitud, mínimo 10 €.
    const margen = abs(hi) / 10n > 1000n ? abs(hi) / 10n : 1000n;
    hi += margen;
  }
  for (const paso of pasosRedondos()) {
    const min = haciaAbajo(lo, paso) * paso;
    const max = haciaArriba(hi, paso) * paso;
    if ((max - min) / paso <= intervalos && max > min) {
      const ticks: bigint[] = [];
      for (let v = min; v <= max; v += paso) ticks.push(v);
      return { min, max, paso, ticks };
    }
  }
  throw new Error('escala_imposible');
}

/** Escala redonda a partir de importes string ('1168.28'); ignora null. */
export function escalaDeImportes(importes: readonly (string | null)[], opciones: OpcionesEscala = {}): EscalaEje {
  const centimos = importes.filter((v): v is string => v !== null).map(aCentimos);
  if (centimos.length === 0) return escalaRedonda(0n, 0n, opciones);
  const min = centimos.reduce((a, b) => (b < a ? b : a));
  const max = centimos.reduce((a, b) => (b > a ? b : a));
  return escalaRedonda(min, max, opciones);
}

/**
 * Posición (0–1, de abajo arriba) de un importe en el eje. Única conversión a `number` permitida:
 * coordenadas de dibujo, nunca dinero. Fuera del eje se acota a [0, 1].
 */
export function posicionEnEje(valor: bigint | string, escala: Pick<EscalaEje, 'min' | 'max'>): number {
  const { min, max } = escala;
  if (max <= min) return 0;
  const c = typeof valor === 'string' ? aCentimos(valor) : valor;
  const acotado = c < min ? min : c > max ? max : c;
  return Number(((acotado - min) * 1_000_000n) / (max - min)) / 1_000_000;
}

/**
 * Tramo vertical de una barra que sale del cero, en % del alto del gráfico: `abajo` (desde el
 * borde inferior) y `alto`. Las negativas quedan por debajo de la línea del cero. Un importe
 * distinto de 0 nunca baja de `minimo` % para que se vea.
 */
export function tramoBarra(valor: string, escala: Pick<EscalaEje, 'min' | 'max'>, minimo = 0.75): { abajo: number; alto: number } {
  const cero = posicionEnEje(0n, escala) * 100;
  const v = posicionEnEje(valor, escala) * 100;
  const alto = Math.abs(v - cero);
  if (aCentimos(valor) === 0n) return { abajo: cero, alto: 0 };
  const visible = Math.max(alto, minimo);
  return { abajo: v < cero ? cero - visible : cero, alto: visible };
}

/** Etiqueta del eje: euros enteros sin decimales ('2.600 €', '-500 €'). */
export function formatearEurosEje(centimos: bigint, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: 'always',
  }).format(desdeCentimos(centimos) as Intl.StringNumericLiteral);
}
