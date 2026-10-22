/**
 * Dinero en el cliente. Reglas (CLAUDE.md → Dinero):
 * - Los importes llegan de la base como string ('1508.00') y así se quedan.
 * - Nunca parseFloat / Number() sobre importes: si hay que operar, céntimos en bigint.
 * - Se formatea con Intl.NumberFormat sobre el string (decimal exacto) y se redondea solo al mostrar.
 */

/** Máximo que cabe en numeric(12,2). */
export const IMPORTE_MAXIMO = '9999999999.99';
const CENTIMOS_MAXIMOS = 999_999_999_999n;

const LITERAL_NUMERICO = /^(\d+(\.\d*)?|\.\d+)$/;
const MILES_CON_PUNTO = /^\d{1,3}(\.\d{3})+$/;
/** Inglés: comas de miles en grupos exactos de 3, con decimales opcionales tras el punto. */
const MILES_CON_COMA = /^\d{1,3}(,\d{3})+(\.\d*)?$/;
const DECIMAL_CON_SIGNO = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Réplica exacta de `leer_importe` (SQL). Devuelve 'dddd.dd' (positivo, 2 decimales) o null.
 * - Quita todo lo que no sea dígito, coma, punto o guion; el signo se ignora ("-24" → "24.00").
 * - Con coma: formato español ("1.258,00" → "1258.00", "38,5" → "38.50").
 * - Sin coma y con puntos de miles exactos: "1.200" → "1200.00".
 * - Más de 2 decimales: redondeo al céntimo, mitades hacia arriba ("1,005" → "1.01").
 * - Vacío o mal formado ("1.2.3", ".", "abc") → null.
 */
export function parsearImporte(texto: string | null | undefined): string | null {
  let s = (texto ?? '').replace(/[^0-9,.-]/g, '').replaceAll('-', '');
  if (s.includes(',')) {
    s = s.replaceAll('.', '').replaceAll(',', '.');
  } else if (MILES_CON_PUNTO.test(s)) {
    s = s.replaceAll('.', '');
  }
  return leerLiteral(s);
}

/** 'ddd.ddd' (punto decimal, sin miles) → 'd.dd' redondeado al céntimo (mitades hacia arriba), o null. */
function leerLiteral(s: string): string | null {
  if (s === '' || !LITERAL_NUMERICO.test(s)) return null;
  const [entera = '', fraccion = ''] = s.split('.');
  let centimos = BigInt(entera === '' ? '0' : entera) * 100n + BigInt(fraccion.slice(0, 2).padEnd(2, '0'));
  const tercera = fraccion.charAt(2);
  if (tercera !== '' && tercera >= '5') centimos += 1n;
  return desdeCentimos(centimos);
}

/** Separador decimal del idioma (',' en es/ca, '.' en en). */
export function separadorDecimal(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? ',';
}

/**
 * Importe escrito por el usuario en la interfaz, leído según el idioma activo. Devuelve 'dddd.dd'
 * (positivo, 2 decimales: lo que se envía a la base) o null.
 * - es / ca (coma decimal): igual que `parsearImporte` / `leer_importe` ('1.258,50' → '1258.50').
 * - en (punto decimal): la coma separa miles y el punto es el decimal ('1,000' → '1000.00',
 *   '1,234.56' → '1234.56', '38.5' → '38.50'). Una coma que no separa grupos exactos de 3 cifras
 *   es ambigua ('1,5', '1.258,50') y se rechaza (null) en lugar de adivinar.
 * El signo se ignora, como en `leer_importe` ('-24' → '24.00').
 */
export function parsearImporteLocal(texto: string | null | undefined, locale: string): string | null {
  if (separadorDecimal(locale) !== '.') return parsearImporte(texto);
  let s = (texto ?? '').replace(/[^0-9,.-]/g, '').replaceAll('-', '');
  if (s.includes(',')) {
    if (!MILES_CON_COMA.test(s)) return null;
    s = s.replaceAll(',', '');
  }
  return leerLiteral(s);
}

/**
 * Importe introducido por el usuario listo para enviar a la base: como `parsearImporteLocal`
 * (según el idioma activo), pero además exige > 0 y que quepa en numeric(12,2). Si no, null.
 */
export function importePositivo(texto: string | null | undefined, locale: string): string | null {
  const valor = parsearImporteLocal(texto, locale);
  if (valor === null) return null;
  const c = aCentimos(valor);
  return c > 0n && c <= CENTIMOS_MAXIMOS ? valor : null;
}

/**
 * String decimal de la base ('1508.00', '-24.5', '22.5331') → céntimos enteros.
 * Con más de 2 decimales redondea al céntimo (mitades alejándose de cero, como `round` de PostgreSQL).
 * Lanza si el string no es un decimal válido.
 */
export function aCentimos(importe: string): bigint {
  const m = DECIMAL_CON_SIGNO.exec(importe.trim());
  if (!m) throw new Error('importe_invalido');
  const [, signo = '', entera = '0', fraccion = ''] = m;
  let c = BigInt(entera) * 100n + BigInt(fraccion.slice(0, 2).padEnd(2, '0'));
  const tercera = fraccion.charAt(2);
  if (tercera !== '' && tercera >= '5') c += 1n;
  return signo === '-' ? -c : c;
}

/** Céntimos → string decimal 'd.dd' (con '-' si es negativo). */
export function desdeCentimos(centimos: bigint): string {
  const negativo = centimos < 0n;
  const abs = negativo ? -centimos : centimos;
  const entera = (abs / 100n).toString();
  const fraccion = (abs % 100n).toString().padStart(2, '0');
  return `${negativo ? '-' : ''}${entera}.${fraccion}`;
}

export type Signo = 'auto' | 'siempre' | 'negativo';

export interface OpcionesEuros {
  /**
   * auto: '-' solo si es negativo (por defecto).
   * siempre: '+' o '-' (cero sin signo). Útil para devoluciones/variaciones.
   * negativo: fuerza '-' (gastos guardados en positivo).
   */
  signo?: Signo;
}

/** '1508.00' → '1.508,00 €' (es). Exacto: Intl formatea el string, sin pasar por float. */
export function formatearEuros(importe: string, locale: string, opciones: OpcionesEuros = {}): string {
  const signo = opciones.signo ?? 'auto';
  let valor = importe.trim();
  if (!DECIMAL_CON_SIGNO.test(valor)) throw new Error('importe_invalido');
  if (signo === 'negativo') valor = `-${valor.replace(/^-/, '')}`;
  const formato = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
    signDisplay: signo === 'siempre' ? 'exceptZero' : 'negative',
  });
  return formato.format(valor as Intl.StringNumericLiteral);
}

export interface OpcionesPorcentaje {
  signo?: Exclude<Signo, 'negativo'>;
}

/**
 * Porcentaje ya calculado en la base ('22.5331…' = 22,53 %) → '22,5 %' con 1 decimal.
 * null (p. ej. ahorro con ingresos 0) → '—'.
 */
export function formatearPorcentaje(
  valor: string | null | undefined,
  locale: string,
  opciones: OpcionesPorcentaje = {},
): string {
  if (valor === null || valor === undefined || valor.trim() === '') return '—';
  const v = valor.trim();
  if (!DECIMAL_CON_SIGNO.test(v)) throw new Error('porcentaje_invalido');
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: opciones.signo === 'siempre' ? 'exceptZero' : 'negative',
  }).format(v as Intl.StringNumericLiteral);
}

/**
 * Variación (%) = (Actual − Anterior) / |Anterior| × 100 (reglas, sección 8), con 4 decimales
 * exactos (mitades alejándose de cero) para pasarla a `formatearPorcentaje`.
 * null = «Sin datos del mes anterior»: falta un periodo o el anterior vale 0.
 */
export function variacionPorcentual(actual: string | null, anterior: string | null): string | null {
  if (actual === null || anterior === null) return null;
  const base = aCentimos(anterior);
  if (base === 0n) return null;
  const divisor = base < 0n ? -base : base;
  const numerador = (aCentimos(actual) - base) * 1_000_000n;
  let cociente = numerador / divisor;
  const resto = numerador % divisor;
  if (2n * (resto < 0n ? -resto : resto) >= divisor) cociente += numerador < 0n ? -1n : 1n;
  const negativo = cociente < 0n;
  const abs = negativo ? -cociente : cociente;
  return `${negativo ? '-' : ''}${(abs / 10_000n).toString()}.${(abs % 10_000n).toString().padStart(4, '0')}`;
}

/** Compara dos importes string sin float: -1, 0, 1. */
export function compararImportes(a: string, b: string): -1 | 0 | 1 {
  const ca = aCentimos(a);
  const cb = aCentimos(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}
