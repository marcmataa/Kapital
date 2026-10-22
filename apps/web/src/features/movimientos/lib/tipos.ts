import type { Database } from '@db/database.types';

type Enums = Database['public']['Enums'];

export type TipoMovimiento = Enums['tipo_movimiento'];
export type MetodoPago = Enums['metodo_pago'];
export type OrigenMovimiento = Enums['origen_movimiento'];
export type SentidoAjuste = Enums['sentido_ajuste'];

export const TIPOS: readonly TipoMovimiento[] = ['gasto', 'ingreso', 'devolucion', 'traspaso', 'ajuste'];
export const METODOS: readonly MetodoPago[] = ['tarjeta', 'apple_pay', 'efectivo', 'transferencia', 'bizum', 'domiciliacion'];
export const SENTIDOS: readonly SentidoAjuste[] = ['suma', 'resta'];

export function esTipo(valor: unknown): valor is TipoMovimiento {
  return typeof valor === 'string' && (TIPOS as readonly string[]).includes(valor);
}

export function esMetodo(valor: unknown): valor is MetodoPago {
  return typeof valor === 'string' && (METODOS as readonly string[]).includes(valor);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Solo se meten en filtros de PostgREST ids con forma de UUID (nada de texto libre). */
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' que además es un día real (no 2026-02-30). */
export function esFechaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !FECHA.test(valor)) return false;
  const [a, m, d] = valor.split('-');
  const fecha = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  return fecha.toISOString().slice(0, 10) === valor;
}

/**
 * Movimiento tal como lo pide la web. `importe` viaja como string ('38.50'): se pide con `importe::text`.
 * `cuenta_id` es la cuenta de la que sale (gasto, traspaso) o en la que entra (ingreso, devolución);
 * en un ajuste es la cuenta corregida.
 */
export interface Movimiento {
  id: string;
  fecha: string;
  hora: string | null;
  concepto: string;
  comercio: string | null;
  tipo: TipoMovimiento;
  importe: string;
  sentido: SentidoAjuste | null;
  categoria_id: string | null;
  metodo: MetodoPago | null;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  devolucion_de: string | null;
  notas: string | null;
  origen: OrigenMovimiento;
  created_at: string;
}

export const COLUMNAS_MOVIMIENTO =
  'id, fecha, hora, concepto, comercio, tipo, importe::text, sentido, categoria_id, metodo, cuenta_id, cuenta_destino_id, devolucion_de, notas, origen, created_at';
