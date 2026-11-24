import type { Cuenta } from '@/shared/api/catalogos';
import { ordenarCuentas } from '@/shared/lib/cuentas';

/** Lo que el desglose necesita de una cuenta. `valor`: valor al cierre de la fecha (SQL), como texto. */
export type CuentaDesglose = Pick<
  Cuenta,
  | 'id'
  | 'nombre'
  | 'clave'
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
 * principal primero, luego por creación y el efectivo al final (`ordenarCuentas`). El valor viene de la base; aquí solo se filtra y ordena.
 * Fuera: las que aún no existían en `fecha` (`valor_cuenta` → NULL) y las cerradas en o antes de `fecha`.
 */
export function cuentasDelDesglose<T extends CuentaDesglose>(
  cuentas: readonly T[],
  fecha: string,
): (T & { valor: string })[] {
  return ordenarCuentas(
    cuentas.filter(
      (c): c is T & { valor: string } =>
        c.valor !== null && c.fecha_inicial <= fecha && (c.fecha_cierre === null || c.fecha_cierre > fecha),
    ),
  );
}
