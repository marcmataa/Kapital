import { finDeMes, inicioDeMes, mismoDiaMesAnterior, partesDe, sumarMeses } from './fechas';

/*
 * Disponibilidad de datos para comparar periodos (reglas, sección 8: «toda comparación enfrenta
 * periodos de la misma longitud; si falta uno de los dos, no se muestra porcentaje»).
 */

/** Fecha mínima de inicio de las cuentas (primer día con datos), o null si no hay cuentas. */
export function inicioDeDatos(cuentas: readonly { fecha_inicial: string }[]): string | null {
  let min: string | null = null;
  for (const c of cuentas) if (min === null || c.fecha_inicial < min) min = c.fecha_inicial;
  return min;
}

/**
 * true si un tramo que empieza en `desde` está entero dentro de los datos (los datos empiezan,
 * como tarde, ese mismo día). Un tramo que empieza antes es parcial: no tiene la misma longitud
 * y se trata como inexistente. Sin datos (`null`) no hay tramo con el que comparar.
 */
export function tramoConDatos(desde: string, inicioDatos: string | null): boolean {
  return inicioDatos !== null && desde >= inicioDatos;
}

/** Rango de fechas civiles [desde, hasta], ambos incluidos ('YYYY-MM-DD'). */
export interface Rango {
  desde: string;
  hasta: string;
}

export interface PeriodosComparacion {
  /** Tramo del mes seleccionado que se compara. */
  actual: Rango;
  /**
   * Mismo tramo del mes anterior; null si ese tramo no está entero en los datos, es decir, si
   * empieza antes del primer día con datos (reglas, sección 8: «misma longitud»).
   */
  anterior: Rango | null;
  /** true si el mes seleccionado es el mes en curso (balance provisional, «hasta hoy»). */
  enCurso: boolean;
}

/**
 * Periodos de la misma longitud (reglas, secciones 7 y 8):
 * - Mes en curso: del día 1 a hoy (d) contra del día 1 a d' = min(d, último día del mes anterior).
 * - Mes cerrado: mes completo contra mes completo.
 * El periodo anterior no existe si empieza antes del primer día con datos (`inicioDatos`): un
 * tramo parcial no tiene la misma longitud y daría un porcentaje engañoso.
 */
export function periodosComparacion(mes: string, hoy: string, inicioDatos: string | null): PeriodosComparacion {
  const primero = inicioDeMes(mes);
  const enCurso = primero === inicioDeMes(hoy);
  const actual: Rango = { desde: primero, hasta: enCurso ? hoy : finDeMes(primero) };
  const desdeAnterior = sumarMeses(primero, -1);
  const hastaAnterior = enCurso ? mismoDiaMesAnterior(hoy) : finDeMes(desdeAnterior);
  const anterior = tramoConDatos(desdeAnterior, inicioDatos) ? { desde: desdeAnterior, hasta: hastaAnterior } : null;
  return { actual, anterior, enCurso };
}

/** Número de meses naturales entre dos meses (día 1), ambos incluidos. */
export function mesesEntre(desde: string, hasta: string): number {
  const a = partesDe(inicioDeMes(desde));
  const b = partesDe(inicioDeMes(hasta));
  return (b.anio - a.anio) * 12 + (b.mes - a.mes) + 1;
}

/** Meses (día 1) seleccionables, del más reciente (el en curso) al del primer dato. */
export function mesesDisponibles(hoy: string, inicioDatos: string | null): string[] {
  const actual = inicioDeMes(hoy);
  if (inicioDatos === null || inicioDatos > hoy) return [actual];
  const total = mesesEntre(inicioDatos, actual);
  return Array.from({ length: total }, (_, i) => sumarMeses(actual, -i));
}

/** Parámetro de URL 'YYYY-MM' → 'YYYY-MM-01'; null si falta o no es válido. */
export function mesDeParametro(parametro: string | null | undefined): string | null {
  if (parametro === null || parametro === undefined || !/^\d{4}-(0[1-9]|1[0-2])$/.test(parametro)) return null;
  return `${parametro}-01`;
}

/** 'YYYY-MM-01' → 'YYYY-MM' (parámetro de URL). */
export function parametroDeMes(mes: string): string {
  return mes.slice(0, 7);
}
