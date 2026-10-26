import type { Periodo } from '../api/inicioApi';

/**
 * Enlace a Movimientos filtrado por categoría y tramo, con los parámetros que ya entiende su lista
 * (`?categoria=&desde=&hasta=`, ver features/movimientos/lib/filtros.ts).
 */
export function enlaceMovimientosCategoria(categoriaId: string, { desde, hasta }: Periodo): string {
  const params = new URLSearchParams({ categoria: categoriaId, desde, hasta });
  return `/movimientos?${params.toString()}`;
}
