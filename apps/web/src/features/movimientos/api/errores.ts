import { aErrorApi, type ErrorApi } from '@/app/api';
import type { ClaveDe } from '@/shared/i18n';

/**
 * Errores de la base al guardar o borrar un movimiento → código propio → texto traducido.
 * El mensaje de PostgreSQL (con nombres de cuentas, importes…) se usa SOLO para clasificar
 * y nunca llega a la pantalla.
 *
 * Origen de cada caso (supabase/migrations/20261015000000_esquema_inicial.sql):
 * - validar_movimiento (23514): categoría de otro tipo, fecha anterior a la cuenta,
 *   devolución de algo que no es un gasto, devoluciones por encima del gasto,
 *   gasto con devoluciones que baja o cambia de tipo.
 * - proteger_cuenta_cerrada (23514): cuenta cerrada.
 * - checks de la tabla (23514): traspaso_con_destino, categoria_segun_tipo…; importe > 0.
 * - 23503: referencia a una cuenta/categoría/gasto que ya no existe.
 */
export type CodigoErrorMovimiento =
  | 'cuenta_cerrada'
  | 'fecha_antes_de_cuenta'
  | 'categoria_tipo'
  | 'solo_gasto'
  | 'devolucion_supera'
  | 'gasto_con_devoluciones'
  | 'traspaso_cuentas'
  | 'importe'
  | 'referencia'
  | 'no_encontrado';

interface ErrorBruto {
  code?: unknown;
  message?: unknown;
}

const REGLAS: readonly [RegExp, CodigoErrorMovimiento][] = [
  [/est[aá] cerrada/i, 'cuenta_cerrada'],
  [/empieza el/i, 'fecha_antes_de_cuenta'],
  [/necesita una categor[ií]a|categoria_segun_tipo/i, 'categoria_tipo'],
  [/solo se puede devolver un gasto|devolucion_de_solo_en_devolucion/i, 'solo_gasto'],
  [/superan el gasto original/i, 'devolucion_supera'],
  [/devueltos/i, 'gasto_con_devoluciones'],
  [/traspaso_con_destino/i, 'traspaso_cuentas'],
  [/importe/i, 'importe'],
];

export function clasificarErrorMovimiento(error: unknown): ErrorApi {
  const base = aErrorApi(error);
  if (typeof error !== 'object' || error === null) return base;
  const e = error as ErrorBruto;
  const mensaje = typeof e.message === 'string' ? e.message : '';
  if (base.codigo === '23503') return { codigo: '23503', mensaje: 'referencia' };
  if (base.codigo === '23514' || base.codigo === 'P0001') {
    const regla = REGLAS.find(([patron]) => patron.test(mensaje));
    if (regla) return { codigo: base.codigo, mensaje: regla[1] };
  }
  return { codigo: base.codigo };
}

type ClaveError = Extract<ClaveDe<'movimientos'>, `error.${string}`>;

const CLAVES: Record<CodigoErrorMovimiento, ClaveError> = {
  cuenta_cerrada: 'error.cuentaCerrada',
  fecha_antes_de_cuenta: 'error.fechaAntesDeCuenta',
  categoria_tipo: 'error.categoriaTipo',
  solo_gasto: 'error.soloGasto',
  devolucion_supera: 'error.devolucionSupera',
  gasto_con_devoluciones: 'error.gastoConDevoluciones',
  traspaso_cuentas: 'error.traspasoCuentas',
  importe: 'error.importe',
  referencia: 'error.referencia',
  no_encontrado: 'error.noEncontrado',
};

function esCodigo(valor: string | undefined): valor is CodigoErrorMovimiento {
  return valor !== undefined && valor in CLAVES;
}

/** Clave de texto para cualquier error de los endpoints de movimientos. */
export function claveErrorMovimiento(error: unknown): ClaveError {
  if (typeof error === 'object' && error !== null && 'codigo' in error) {
    const e = error as ErrorApi;
    if (e.codigo === 'red') return 'error.red';
    if (esCodigo(e.mensaje)) return CLAVES[e.mensaje];
  }
  return 'error.generico';
}
