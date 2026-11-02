import { aCentimos, desdeCentimos } from '@/shared/lib/dinero';

/**
 * Reparto de una devolución entre varios gastos (reglas, sección 3, cambio del 02/11/2026).
 * Todo en céntimos enteros (nunca parseFloat). La base vuelve a comprobarlo todo
 * (registrar_devoluciones y validar_devolucion); esto solo enseña el reparto antes de guardar.
 *
 * - El total se reparte llenando lo pendiente de cada gasto en el orden elegido.
 * - El usuario puede fijar a mano el importe de un gasto; los demás se llenan con lo que queda.
 * - Si el total supera lo pendiente de todos los gastos (y cada uno se devuelve entero), el
 *   resto es el sobrante, que se guarda como ingreso.
 * - Si no, la suma de las partes tiene que ser exactamente el total.
 */

export interface GastoARepartir {
  id: string;
  /** Lo que queda por devolver del gasto, 'd.dd'. */
  pendiente: string;
}

export type ErrorLinea = 'importe' | 'supera' | 'vacia';
export type ErrorReparto = 'no_cuadra';

export interface LineaReparto {
  id: string;
  /** Importe de esta devolución, 'd.dd' (null si el importe escrito a mano no es válido). */
  importe: string | null;
  pendiente: string;
  /** El usuario lo escribió a mano. */
  manual: boolean;
  error: ErrorLinea | null;
}

export interface Reparto {
  lineas: LineaReparto[];
  /** Total que se reparte entre los gastos, 'd.dd'. */
  repartido: string;
  /** Lo que se guarda como ingreso, 'd.dd', o null si no sobra nada. */
  sobrante: string | null;
  error: ErrorReparto | null;
}

/**
 * @param total importe total recibido, 'd.dd' (null si todavía no es válido: no hay reparto).
 * @param gastos gastos elegidos, en el orden elegido.
 * @param manuales importes fijados a mano por id ('d.dd', o null si lo escrito no es un importe válido).
 */
export function repartirDevolucion(
  total: string | null,
  gastos: readonly GastoARepartir[],
  manuales: Readonly<Record<string, string | null>> = {},
): Reparto | null {
  if (total === null || gastos.length === 0) return null;
  const t = aCentimos(total);
  const esManual = (id: string) => Object.prototype.hasOwnProperty.call(manuales, id);

  let fijado = 0n;
  for (const g of gastos) {
    const m = esManual(g.id) ? manuales[g.id] : undefined;
    if (m != null) fijado += aCentimos(m);
  }
  let resto = t - fijado;

  const lineas: LineaReparto[] = gastos.map((g) => {
    const pendiente = aCentimos(g.pendiente);
    if (esManual(g.id)) {
      const m = manuales[g.id] ?? null;
      if (m === null) return { id: g.id, importe: null, pendiente: g.pendiente, manual: true, error: 'importe' };
      const c = aCentimos(m);
      const error: ErrorLinea | null = c <= 0n ? 'importe' : c > pendiente ? 'supera' : null;
      return { id: g.id, importe: desdeCentimos(c), pendiente: g.pendiente, manual: true, error };
    }
    const c = resto > 0n ? (resto < pendiente ? resto : pendiente) : 0n;
    resto -= c;
    return { id: g.id, importe: desdeCentimos(c), pendiente: g.pendiente, manual: false, error: c === 0n ? 'vacia' : null };
  });

  const suma = lineas.reduce((s, l) => s + (l.importe === null ? 0n : aCentimos(l.importe)), 0n);
  const enteros = lineas.every((l) => l.importe !== null && aCentimos(l.importe) === aCentimos(l.pendiente));
  let sobrante: string | null = null;
  let error: ErrorReparto | null = null;
  if (suma < t && enteros) sobrante = desdeCentimos(t - suma);
  else if (suma !== t) error = 'no_cuadra';

  return { lineas, repartido: desdeCentimos(suma), sobrante, error };
}

/** El reparto se puede guardar: ninguna línea con error y la suma cuadra. */
export function repartoValido(r: Reparto | null): r is Reparto {
  return r !== null && r.error === null && r.lineas.every((l) => l.error === null);
}
