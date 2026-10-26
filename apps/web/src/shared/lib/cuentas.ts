import type { FuncionT } from '@/shared/i18n';

/*
 * Nombre visible de una cuenta.
 *
 * La cuenta de efectivo que crea el onboarding lleva `clave = 'efectivo'` y se muestra traducida
 * («Efectivo», «Cash», «Efectiu»). El resto (bancos, cuentas propias o la de efectivo renombrada)
 * tiene `clave` null y se muestra tal cual: los bancos con `entidad` son nombres propios.
 * `nombre` en la base sigue siendo «Efectivo» (lo usa el atajo en «desde»/«hacia»). Al renombrar,
 * la base pone la clave a null (trigger de 20261024000000_categorias_y_cuentas_clave.sql).
 */

/** Mismos valores que el check `cuentas_clave_valida` de la base. */
export const CLAVES_CUENTA = ['efectivo'] as const;

export type ClaveCuenta = (typeof CLAVES_CUENTA)[number];

export function esClaveCuenta(valor: unknown): valor is ClaveCuenta {
  return typeof valor === 'string' && (CLAVES_CUENTA as readonly string[]).includes(valor);
}

export interface CuentaConNombre {
  nombre: string;
  clave?: string | null | undefined;
}

/** Nombre traducido si es la cuenta de efectivo por defecto; si no, el nombre tal cual. */
export function nombreCuenta(cuenta: CuentaConNombre, t: FuncionT<'common'>): string {
  return esClaveCuenta(cuenta.clave) ? t('cuenta.efectivo') : cuenta.nombre;
}
