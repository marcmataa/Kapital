/*
 * Disponibilidad de datos para comparar periodos (reglas, sección 8: «toda comparación enfrenta
 * periodos de la misma longitud; si falta uno de los dos, no se muestra porcentaje»).
 */

/** Fecha mínima de inicio de las cuentas (primer día con datos), o null si no hay cuentas. */
export function inicioDeDatos(cuentas: readonly { fecha_inicial: string }[]): string | null {
  let min: string | null = null;
  for (const c of cuentas) if (min === null || c.fecha_inicial < min) min = c.fecha_inicial;
  return min;
}

/**
 * true si un tramo que empieza en `desde` está entero dentro de los datos (los datos empiezan,
 * como tarde, ese mismo día). Un tramo que empieza antes es parcial: no tiene la misma longitud
 * y se trata como inexistente. Sin datos (`null`) no hay tramo con el que comparar.
 */
export function tramoConDatos(desde: string, inicioDatos: string | null): boolean {
  return inicioDatos !== null && desde >= inicioDatos;
}
