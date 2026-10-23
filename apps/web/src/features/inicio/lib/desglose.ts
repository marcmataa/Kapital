import type { Cuenta } from '@/shared/api/catalogos';

/** Lo que el desglose necesita de una cuenta. `valor`: valor al cierre de la fecha (SQL), como texto. */
export type CuentaDesglose = Pick<
  Cuenta,
  | 'id'
  | 'nombre'
  | 'tipo'
  | 'entidad'
  | 'color'
  | 'emoji'
  | 'es_principal'
  | 'orden'
  | 'fecha_inicial'
  | 'fecha_cierre'
  | 'valor'
>;

/**
 * Cuentas que se ven en el desglose del patrimonio a `fecha` ('YYYY-MM-DD'), en su orden:
 * principal primero y luego por `orden`. El valor viene de la base; aquí solo se filtra y ordena.
 * Fuera: las que aún no existían en `fecha` (`valor_cuenta` → NULL) y las cerradas en o antes de `fecha`.
 */
export function cuentasDelDesglose<T extends CuentaDesglose>(
  cuentas: readonly T[],
  fecha: string,
): (T & { valor: string })[] {
  return cuentas
    .filter(
      (c): c is T & { valor: string } =>
        c.valor !== null && c.fecha_inicial <= fecha && (c.fecha_cierre === null || c.fecha_cierre > fecha),
    )
    .sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden);
}
