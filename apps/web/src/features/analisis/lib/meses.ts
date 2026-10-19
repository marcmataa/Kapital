import { inicioDeMes, sumarMeses } from '@/shared/lib/fechas';
import type { FilaAnalisis } from '../schemas/esquemas';

/** Cuántos meses cerrados hacia atrás se pueden generar (igual que la Edge Function). */
export const MESES_ATRAS_PERMITIDOS = 12;

export type EntradaMes =
  | { tipo: 'en_curso'; mes: string }
  | { tipo: 'fila'; mes: string; fila: FilaAnalisis }
  | { tipo: 'generable'; mes: string };

/**
 * Meses de la lista de análisis, del más reciente al más antiguo:
 * - el mes en curso («se genera el 1/<siguiente>»);
 * - cada mes con fila en `analisis_mensuales`;
 * - meses cerrados sin fila, hasta 12 atrás y no antes del primer mes con datos → «Generar análisis».
 */
export function entradasMeses(hoy: string, inicioDatos: string | null, filas: readonly FilaAnalisis[]): EntradaMes[] {
  const mesActual = inicioDeMes(hoy);
  const porMes = new Map(filas.map((f) => [f.mes, f]));
  const entradas: EntradaMes[] = [{ tipo: 'en_curso', mes: mesActual }];
  const vistos = new Set([mesActual]);

  if (inicioDatos !== null) {
    const limite = sumarMeses(mesActual, -MESES_ATRAS_PERMITIDOS);
    const inicioMes = inicioDeMes(inicioDatos);
    for (let i = 1; i <= MESES_ATRAS_PERMITIDOS; i++) {
      const mes = sumarMeses(mesActual, -i);
      if (mes < limite || mes < inicioMes) break;
      if (!porMes.has(mes)) {
        entradas.push({ tipo: 'generable', mes });
        vistos.add(mes);
      }
    }
  }
  for (const fila of filas) {
    if (!vistos.has(fila.mes)) {
      entradas.push({ tipo: 'fila', mes: fila.mes, fila });
      vistos.add(fila.mes);
    }
  }
  return entradas.sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : 0));
}

/** ¿Se puede pedir la primera generación de `mes`? (cerrado, ≤ 12 meses atrás, con datos). */
export function esGenerable(mes: string, hoy: string, inicioDatos: string | null): boolean {
  const mesActual = inicioDeMes(hoy);
  return (
    inicioDatos !== null &&
    mes < mesActual &&
    mes >= sumarMeses(mesActual, -MESES_ATRAS_PERMITIDOS) &&
    mes >= inicioDeMes(inicioDatos)
  );
}

/** Parámetro de ruta 'YYYY-MM' → 'YYYY-MM-01'; null si no es válido. */
export function mesDeRuta(parametro: string | undefined): string | null {
  if (parametro === undefined || !/^\d{4}-(0[1-9]|1[0-2])$/.test(parametro)) return null;
  return `${parametro}-01`;
}

/** 'YYYY-MM-01' → 'YYYY-MM' para la ruta /analisis/:mes. */
export function rutaDeMes(mes: string): string {
  return `/analisis/${mes.slice(0, 7)}`;
}

/** Mínima fecha de inicio de las cuentas, o null si no hay. */
export function inicioDeDatos(cuentas: readonly { fecha_inicial: string }[]): string | null {
  let min: string | null = null;
  for (const c of cuentas) if (min === null || c.fecha_inicial < min) min = c.fecha_inicial;
  return min;
}
