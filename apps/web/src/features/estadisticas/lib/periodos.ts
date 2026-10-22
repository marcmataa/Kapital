import { componerFecha, diasDelMes, finDeMes, inicioDeMes, partesDe, sumarMeses } from '@/shared/lib/fechas';
import { mesesEntre, tramoConDatos, type Rango } from '@/shared/lib/periodos';

// Compartidos con Inicio (selector de mes): viven en shared/lib/periodos.
export {
  inicioDeDatos,
  mesesDisponibles,
  mesesEntre,
  periodosComparacion,
  tramoConDatos,
  type PeriodosComparacion,
  type Rango,
} from '@/shared/lib/periodos';

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

/**
 * El bloque interanual solo aparece con al menos 12 meses de datos y si el mismo mes del año
 * anterior tiene datos desde su día 1 (un mes empezado a mitad no tiene la misma longitud).
 */
export function hayInteranual(mes: string, hoy: string, inicioDatos: string | null): boolean {
  if (inicioDatos === null) return false;
  return mesesEntre(inicioDeMes(inicioDatos), hoy) >= 12 && tramoConDatos(sumarMeses(mes, -12), inicioDatos);
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
