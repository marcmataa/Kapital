import {
  componerFecha,
  diasDelMes,
  finDeMes,
  inicioDeMes,
  mismoDiaMesAnterior,
  partesDe,
  sumarMeses,
} from '@/shared/lib/fechas';

/** Rango de fechas civiles [desde, hasta], ambos incluidos ('YYYY-MM-DD'). */
export interface Rango {
  desde: string;
  hasta: string;
}

export interface PeriodosComparacion {
  /** Tramo del mes seleccionado que se compara. */
  actual: Rango;
  /** Mismo tramo del mes anterior; null si no hay datos de ese mes (reglas, sección 8). */
  anterior: Rango | null;
  /** true si el mes seleccionado es el mes en curso (balance provisional, «hasta hoy»). */
  enCurso: boolean;
}

/**
 * Periodos de la misma longitud (reglas, secciones 7 y 8):
 * - Mes en curso: del día 1 a hoy (d) contra del día 1 a d' = min(d, último día del mes anterior).
 * - Mes cerrado: mes completo contra mes completo.
 * El periodo anterior no existe si termina antes del primer día con datos (`inicioDatos`).
 */
export function periodosComparacion(mes: string, hoy: string, inicioDatos: string | null): PeriodosComparacion {
  const primero = inicioDeMes(mes);
  const enCurso = primero === inicioDeMes(hoy);
  const actual: Rango = { desde: primero, hasta: enCurso ? hoy : finDeMes(primero) };
  const desdeAnterior = sumarMeses(primero, -1);
  const hastaAnterior = enCurso ? mismoDiaMesAnterior(hoy) : finDeMes(desdeAnterior);
  const anterior = inicioDatos === null || hastaAnterior < inicioDatos ? null : { desde: desdeAnterior, hasta: hastaAnterior };
  return { actual, anterior, enCurso };
}

/**
 * Mismo tramo un año antes (interanual, sección 8). Para el mes en curso, 1..d contra 1..d
 * (ajustado al último día si no existe, p. ej. 29 de febrero).
 */
export function rangoInteranual(actual: Rango): Rango {
  const desde = sumarMeses(actual.desde, -12);
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
 * anterior ya tiene datos (si no, no hay con qué comparar).
 */
export function hayInteranual(mes: string, hoy: string, inicioDatos: string | null): boolean {
  if (inicioDatos === null) return false;
  const inicioMes = inicioDeMes(inicioDatos);
  return mesesEntre(inicioMes, hoy) >= 12 && sumarMeses(mes, -12) >= inicioMes;
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

/** Fecha mínima de inicio de las cuentas (primer día con datos), o null si no hay cuentas. */
export function inicioDeDatos(cuentas: readonly { fecha_inicial: string }[]): string | null {
  let min: string | null = null;
  for (const c of cuentas) if (min === null || c.fecha_inicial < min) min = c.fecha_inicial;
  return min;
}
