import { aCentimos } from './dinero';

/**
 * Cómo se muestra la tasa de ahorro (reglas, sección 3; cambio del 02/11/2026).
 * - `porcentaje`: hay ingresos > 0 y el ahorro está entre −100 % y 100 % (ambos incluidos): se
 *   muestra el porcentaje, tal cual llega de SQL (se redondea solo al mostrar).
 * - `sinIngresos`: los ingresos son 0 (o el ahorro llega null de SQL): «—» y una explicación.
 * - `fueraDeRango`: hay ingresos, pero tan pocos frente al gasto que el porcentaje no se puede
 *   leer (p. ej. −2.345,0 %): en su lugar, un texto («Aún no hay ingresos suficientes…»).
 */
export type LecturaAhorro =
  | { tipo: 'porcentaje'; porcentaje: string }
  | { tipo: 'sinIngresos' }
  | { tipo: 'fueraDeRango' };

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** ¿|valor| ≤ 100, exacto y sin pasar por float? Lanza si `valor` no es un decimal válido. */
function dentroDeCien(valor: string): boolean {
  const m = DECIMAL.exec(valor.trim());
  if (!m) throw new Error('porcentaje_invalido');
  const entera = BigInt(m[2] ?? '0');
  const fraccion = m[3] ?? '';
  if (entera < 100n) return true;
  return entera === 100n && /^0*$/.test(fraccion);
}

/**
 * Regla única de la tasa de ahorro para toda la app (Estadísticas, Análisis y, más adelante,
 * Inicio). Función pura: decide QUÉ mostrar; el texto lo pone cada pantalla con sus traducciones
 * (claves comunes `ahorro.*`).
 *
 * @param ingresos Ingresos del periodo, como string de la base ('1508.00').
 * @param ahorroPct Balance / ingresos × 100 calculado en SQL ('22.5278…'); null sin ingresos.
 */
export function lecturaAhorro(ingresos: string, ahorroPct: string | null): LecturaAhorro {
  if (aCentimos(ingresos) <= 0n || ahorroPct === null) return { tipo: 'sinIngresos' };
  return dentroDeCien(ahorroPct) ? { tipo: 'porcentaje', porcentaje: ahorroPct } : { tipo: 'fueraDeRango' };
}
