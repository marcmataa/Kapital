import { formatearEuros } from '@/shared/lib/dinero';
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

/** '2026-10-14' → '14 oct' */
export function diaCorto(fecha: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${fecha}T00:00:00Z`))
    .replace('.', '');
}

export interface GrupoDia<T> {
  /** 'YYYY-MM-DD'. */
  fecha: string;
  movimientos: T[];
}

/** Agrupa una lista ya ordenada por fecha descendente en días consecutivos. */
export function agruparPorDia<T extends Pick<Movimiento, 'fecha'>>(lista: readonly T[]): GrupoDia<T>[] {
  const grupos: GrupoDia<T>[] = [];
  for (const m of lista) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.fecha === m.fecha) ultimo.movimientos.push(m);
    else grupos.push({ fecha: m.fecha, movimientos: [m] });
  }
  return grupos;
}

/** Cabecera de un día: '14 oct', y con año si no es el año de `hoy` ('14 oct 2025'). */
export function tituloDia(fecha: string, hoy: string, locale: string): string {
  const dia = diaCorto(fecha, locale);
  return fecha.slice(0, 4) === hoy.slice(0, 4) ? dia : `${dia} ${fecha.slice(0, 4)}`;
}

/**
 * Importe redondeado a euros enteros para los chips ('−863 €'). Solo para mostrar: Intl redondea
 * el string decimal tal cual (sin pasar por float). `signo` como en formatearEuros.
 */
export function eurosRedondos(importe: string, locale: string, signo: 'auto' | 'siempre' | 'negativo' = 'auto'): string {
  let valor = importe.trim();
  if (!/^-?\d+(\.\d+)?$/.test(valor)) throw new Error('importe_invalido');
  if (signo === 'negativo') valor = `-${valor.replace(/^-/, '')}`;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    signDisplay: signo === 'siempre' ? 'exceptZero' : 'negative',
  }).format(valor as Intl.StringNumericLiteral);
}

/** Signo con el que se muestra el total de un tipo en su chip (el de su importe en la lista). */
export function signoTotalTipo(tipo: Movimiento['tipo']): 'auto' | 'siempre' | 'negativo' {
  switch (tipo) {
    case 'gasto':
      return 'negativo';
    case 'ingreso':
    case 'devolucion':
    case 'ajuste':
      return 'siempre';
    case 'traspaso':
      return 'auto';
  }
}
