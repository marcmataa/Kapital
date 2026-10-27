/** Filtros de la lista de Movimientos que se pueden fijar desde un enlace. */
export interface FiltroEnlace {
  tipo?: 'gasto' | 'ingreso' | 'devolucion' | 'traspaso' | 'ajuste';
  categoria?: string;
  cuenta?: string;
  desde?: string;
  hasta?: string;
}

/**
 * Enlace a Movimientos con filtros aplicados, con los parámetros que ya entiende su lista
 * (`?tipo=&categoria=&cuenta=&desde=&hasta=`, ver features/movimientos/lib/filtros.ts). Así cada
 * cifra de un resumen lleva a los movimientos que la explican (auditoría F08).
 */
export function enlaceMovimientos(filtro: FiltroEnlace): string {
  const params = new URLSearchParams();
  for (const clave of ['tipo', 'categoria', 'cuenta', 'desde', 'hasta'] as const) {
    const valor = filtro[clave];
    if (valor !== undefined) params.set(clave, valor);
  }
  const query = params.toString();
  return query === '' ? '/movimientos' : `/movimientos?${query}`;
}
