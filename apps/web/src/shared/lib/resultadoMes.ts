import { aCentimos, desdeCentimos, porcentajeDe } from './dinero';

/*
 * Resultado del mes (ingresos → gastos → lo que queda) para `shared/ui/graficos/ResultadoMes`,
 * común a Estadísticas › Balance y a Análisis. Los totales llegan de SQL; aquí solo se ordenan y
 * agrupan categorías y se reparten porcentajes, siempre en céntimos bigint (nunca parseFloat).
 */

/** Gasto neto de una categoría (gastos − devoluciones, sección 8), tal cual llega de SQL. */
export interface CategoriaGasto {
  id: string;
  nombre: string;
  color: string;
  gasto: string;
  /** Movimientos que explican la fila (auditoría F08). */
  href?: string | undefined;
}

export interface FilaCategoriaResultado extends CategoriaGasto {
  /**
   * % sobre la suma de las categorías con gasto positivo (sección 8, cambio del 19/10/2026), con 4
   * decimales; null en las categorías en negativo (no llevan porcentaje).
   */
  porcentaje: string | null;
}

export interface GrupoResto {
  /** Suma exacta de las categorías agrupadas. */
  gasto: string;
  porcentaje: string | null;
  /** Nombres de las categorías agrupadas, en el mismo orden (de mayor a menor). */
  nombres: string[];
}

export interface CategoriasResultado {
  /** Las de más gasto, de mayor a menor (como mucho `max`). */
  principales: FilaCategoriaResultado[];
  /** El resto de categorías con gasto positivo, sumadas; null si no hay. */
  resto: GrupoResto | null;
  /** Categorías en negativo (te devolvieron más de lo que gastaste): aparte y sin porcentaje. */
  negativas: FilaCategoriaResultado[];
}

/** Categorías que se ven una a una en el resultado del mes; el resto se agrupa. */
export const MAX_CATEGORIAS_RESULTADO = 5;

/**
 * Categorías de gasto de mayor a menor: las `max` primeras sueltas y el resto en un grupo
 * («Resto de categorías», que no es la categoría «Otros gastos»; el grupo lista sus nombres). Las
 * de 0 € no aparecen; las negativas van aparte.
 */
export function categoriasDelResultado(
  categorias: readonly CategoriaGasto[],
  max: number = MAX_CATEGORIAS_RESULTADO,
): CategoriasResultado {
  const conCentimos = categorias.map((c) => ({ c, centimos: aCentimos(c.gasto) }));
  const positivas = conCentimos
    .filter((x) => x.centimos > 0n)
    .sort((a, b) => (a.centimos === b.centimos ? a.c.nombre.localeCompare(b.c.nombre) : a.centimos > b.centimos ? -1 : 1));
  const total = positivas.reduce((s, x) => s + x.centimos, 0n);
  const sueltas = positivas.slice(0, max);
  const agrupadas = positivas.slice(sueltas.length);
  const sumaResto = agrupadas.reduce((s, x) => s + x.centimos, 0n);
  return {
    principales: sueltas.map((x) => ({ ...x.c, porcentaje: porcentajeDe(x.centimos, total) })),
    resto:
      agrupadas.length === 0
        ? null
        : { gasto: desdeCentimos(sumaResto), porcentaje: porcentajeDe(sumaResto, total), nombres: agrupadas.map((x) => x.c.nombre) },
    negativas: conCentimos
      .filter((x) => x.centimos < 0n)
      .sort((a, b) => (a.centimos < b.centimos ? -1 : a.centimos > b.centimos ? 1 : 0))
      .map((x) => ({ ...x.c, porcentaje: null })),
  };
}

/** Qué pasa con el balance del mes: sobra dinero, falta o queda justo a cero. */
export type SentidoResultado = 'queda' | 'falta' | 'cero';

export function sentidoResultado(balance: string): SentidoResultado {
  const c = aCentimos(balance);
  return c > 0n ? 'queda' : c < 0n ? 'falta' : 'cero';
}

/** Valor absoluto de un importe en texto ('-204.13' → '204.13'), sin pasar por float. */
export function importeAbsoluto(importe: string): string {
  const c = aCentimos(importe);
  return desdeCentimos(c < 0n ? -c : c);
}
