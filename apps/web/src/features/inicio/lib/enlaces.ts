import { enlaceMovimientos } from '@/shared/lib/enlaces';
import type { Periodo } from '../api/inicioApi';

/**
 * Enlace a Movimientos filtrado por categoría y tramo, con los parámetros que ya entiende su lista
 * (`?categoria=&desde=&hasta=`, ver features/movimientos/lib/filtros.ts).
 */
export function enlaceMovimientosCategoria(categoriaId: string, { desde, hasta }: Periodo): string {
  return enlaceMovimientos({ categoria: categoriaId, desde, hasta });
}
