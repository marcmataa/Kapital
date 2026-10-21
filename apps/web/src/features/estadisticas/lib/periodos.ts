import {
  componerFecha,
  diasDelMes,
  finDeMes,
  inicioDeMes,
  mismoDiaMesAnterior,
  partesDe,
  sumarMeses,
} from '@/shared/lib/fechas';
import { tramoConDatos } from '@/shared/lib/periodos';

export { inicioDeDatos, tramoConDatos } from '@/shared/lib/periodos';

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

/**
 * Mismo tramo un año antes (interanual, sección 8).
 * - Mes en curso: 1..d contra 1..d (ajustado al último día si no existe, p. ej. 29 de febrero).
 * - Mes cerrado: mes completo contra mes completo (febrero de 2029, 28 días, contra febrero de
 *   2028, 29 días).
 */
export function rangoInteranual(actual: Rango, enCurso: boolean): Rango {
  const desde = sumarMeses(actual.desde, -12);
  if (!enCurso) return { desde, hasta: finDeMes(desde) };
  const { dia } = partesDe(actual.hasta);
  const { anio, mes } = partesDe(desde);
  return { desde, hasta: componerFecha({ anio, mes, dia: Math.min(dia, diasDelMes(anio, mes)) }) };
}

/** Número de meses naturales entre dos meses (día 1), ambos incluidos. */
export function mesesEntre(desde: string, hasta: string): number {
  const a = partesDe(inicioDeMes(desde));
  const b = partesDe(inicioDeMes(hasta));
  return (b.anio - a.anio) * 12 + (b.mes - a.mes) + 1;
}

/**
 * El bloque interanual solo aparece con al menos 12 meses de datos y si el mismo mes del año
 * anterior tiene datos desde su día 1 (un mes empezado a mitad no tiene la misma longitud).
 */
export function hayInteranual(mes: string, hoy: string, inicioDatos: string | null): boolean {
  if (inicioDatos === null) return false;
  return mesesEntre(inicioDeMes(inicioDatos), hoy) >= 12 && tramoConDatos(sumarMeses(mes, -12), inicioDatos);
}

/** Meses (día 1) seleccionables, del más reciente (el en curso) al del primer dato. */
export function mesesDisponibles(hoy: string, inicioDatos: string | null): string[] {
  const actual = inicioDeMes(hoy);
  if (inicioDatos === null || inicioDatos > hoy) return [actual];
  const total = mesesEntre(inicioDatos, actual);
  return Array.from({ length: total }, (_, i) => sumarMeses(actual, -i));
}

/** Últimos `n` meses hasta `mes` (incluido), sin pasar del primer mes con datos. Orden cronológico. */
export function ultimosMeses(mes: string, n: number, inicioDatos: string | null): string[] {
  const inicioMes = inicioDatos === null ? inicioDeMes(mes) : inicioDeMes(inicioDatos);
  const meses: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = sumarMeses(mes, -i);
    if (m >= inicioMes) meses.push(m);
  }
  return meses;
}

