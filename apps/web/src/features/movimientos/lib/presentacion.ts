import { formatearEuros } from '@/shared/lib/dinero';
import { formatearDiaMes } from '@/shared/lib/fechas';
import type { Movimiento } from './tipos';

export type Tono = 'positivo' | 'negativo' | 'neutro';

/**
 * Cómo se muestra el importe de cada tipo (reglas, sección 2). El importe siempre es positivo
 * en la base; el signo lo pone el tipo:
 * - gasto: «−» y rojo (sale dinero y suma a gastos).
 * - ingreso y devolución: «+» y verde (entra dinero).
 * - traspaso: sin signo y neutro (no cambia el balance ni el patrimonio).
 * - ajuste: signo según el sentido, pero neutro (no cuenta en el balance; va aparte).
 */
export function tonoImporte(m: Pick<Movimiento, 'tipo'>): Tono {
  switch (m.tipo) {
    case 'gasto':
      return 'negativo';
    case 'ingreso':
    case 'devolucion':
      return 'positivo';
    default:
      return 'neutro';
  }
}

export function importeConSigno(m: Pick<Movimiento, 'tipo' | 'importe' | 'sentido'>, locale: string): string {
  switch (m.tipo) {
    case 'gasto':
      return formatearEuros(m.importe, locale, { signo: 'negativo' });
    case 'ingreso':
    case 'devolucion':
      return formatearEuros(m.importe, locale, { signo: 'siempre' });
    case 'ajuste':
      return formatearEuros(m.importe, locale, { signo: m.sentido === 'resta' ? 'negativo' : 'siempre' });
    case 'traspaso':
      return formatearEuros(m.importe, locale);
  }
}

export const CLASE_TONO: Record<Tono, string> = {
  positivo: 'text-positivo',
  negativo: 'text-negativo',
  neutro: 'text-apagado',
};

export interface GrupoMes<T> {
  /** Día 1 del mes ('2026-10-01'). */
  mes: string;
  movimientos: T[];
}

/** Agrupa una lista ya ordenada por fecha descendente en meses consecutivos. */
export function agruparPorMes<T extends Pick<Movimiento, 'fecha'>>(lista: readonly T[]): GrupoMes<T>[] {
  const grupos: GrupoMes<T>[] = [];
  for (const m of lista) {
    const mes = `${m.fecha.slice(0, 7)}-01`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.mes === mes) ultimo.movimientos.push(m);
    else grupos.push({ mes, movimientos: [m] });
  }
  return grupos;
}

/** '2026-10-01' → 'Octubre 2026' (sin el «de» de Intl en español). */
export function tituloMes(mes: string, locale: string): string {
  const fecha = new Date(`${mes}T00:00:00Z`);
  const nombre = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(fecha);
  return `${nombre.charAt(0).toLocaleUpperCase(locale)}${nombre.slice(1)} ${mes.slice(0, 4)}`;
}

/** '2026-10-14' → '14 oct'. El formateador de fecha corta de toda la app. */
export function diaCorto(fecha: string, locale: string): string {
  return formatearDiaMes(fecha, locale);
}
