import { aCentimos, compararImportes, desdeCentimos } from '@/shared/lib/dinero';
import { componerFecha, diasDelMes, inicioDeMes, partesDe } from '@/shared/lib/fechas';

/*
 * Presentación de agregados en el cliente. Las sumas, medias y variaciones las hace SQL
 * (movimientos_por_dia, comparativa_estadisticas, gasto_por_categoria…); aquí solo se completa la
 * serie de días, se emparejan filas y se reparten porcentajes de dibujo, siempre en céntimos
 * `bigint` (nunca parseFloat/Number sobre importes).
 */

/** Movimiento de un día (`movimientos_por_dia`), con el importe como texto. */
export interface MovimientoDia {
  id: string;
  tipo: 'gasto' | 'devolucion' | 'ingreso';
  concepto: string;
  importe: string;
}

/** Fila de `movimientos_por_dia`: solo días con gastos, devoluciones o ingresos. */
export interface FilaDia {
  fecha: string;
  gastos: string;
  devoluciones: string;
  gasto_neto: string;
  ingresos: string;
  movimientos: MovimientoDia[];
}

export interface DiaSerie {
  dia: number;
  fecha: string;
  /** true para hoy: el valor es provisional. */
  hoy: boolean;
  /** null en días futuros (no se dibujan). Días sin movimientos: todo a 0,00 € y sin lista. */
  datos: Omit<FilaDia, 'fecha'> | null;
}

const DIA_VACIO: Omit<FilaDia, 'fecha'> = {
  gastos: '0.00',
  devoluciones: '0.00',
  gasto_neto: '0.00',
  ingresos: '0.00',
  movimientos: [],
};

const sinFecha = ({ fecha: _fecha, ...resto }: FilaDia): Omit<FilaDia, 'fecha'> => resto;

/**
 * Todos los días del mes de `mes` a partir de `movimientos_por_dia` (los totales vienen de SQL;
 * aquí no se suma nada). Los días posteriores a `hoy` quedan vacíos (null).
 */
export function serieDiaria(filas: readonly FilaDia[], mes: string, hoy: string): DiaSerie[] {
  const { anio, mes: m } = partesDe(inicioDeMes(mes));
  const porFecha = new Map(filas.map((f) => [f.fecha, f]));
  return Array.from({ length: diasDelMes(anio, m) }, (_, i) => {
    const fecha = componerFecha({ anio, mes: m, dia: i + 1 });
    const fila = porFecha.get(fecha);
    const datos = fila ? sinFecha(fila) : DIA_VACIO;
    return { dia: i + 1, fecha, hoy: fecha === hoy, datos: fecha > hoy ? null : datos };
  });
}

/** Una fila de comparación «este periodo vs el anterior». */
export interface FilaComparada {
  id: string;
  nombre: string;
  color?: string;
  actual: string;
  /** null = no hay periodo anterior que comparar. */
  anterior: string | null;
}

/**
 * Empareja por id las filas del periodo actual y del anterior (las que solo están en uno salen
 * con 0,00 € en el otro) y ordena de mayor a menor importe actual. `hayAnterior` = false deja
 * `anterior` a null en todas.
 */
export function emparejar(
  actual: readonly { id: string; nombre: string; color?: string; importe: string }[],
  anterior: readonly { id: string; nombre: string; color?: string; importe: string }[],
  hayAnterior: boolean,
): FilaComparada[] {
  const previas = new Map(anterior.map((f) => [f.id, f]));
  const filas: FilaComparada[] = actual.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    ...(f.color !== undefined && { color: f.color }),
    actual: f.importe,
    anterior: hayAnterior ? (previas.get(f.id)?.importe ?? '0.00') : null,
  }));
  if (hayAnterior) {
    const ids = new Set(actual.map((f) => f.id));
    for (const f of anterior) {
      if (!ids.has(f.id)) {
        filas.push({ id: f.id, nombre: f.nombre, ...(f.color !== undefined && { color: f.color }), actual: '0.00', anterior: f.importe });
      }
    }
  }
  return filas.sort((a, b) => compararImportes(b.actual, a.actual) || compararImportes(b.anterior ?? '0', a.anterior ?? '0') || a.nombre.localeCompare(b.nombre));
}

/**
 * Posición (0–1) de `valor` entre `min` y `max` (céntimos) para dibujar ejes con negativos.
 * Solo coordenadas, nunca dinero.
 */
export function fraccionEntre(valor: string, min: bigint, max: bigint): number {
  if (max <= min) return 0;
  const c = aCentimos(valor);
  const acotado = c < min ? min : c > max ? max : c;
  return Number(((acotado - min) * 10_000n) / (max - min)) / 10_000;
}
/** Fila de `ingresos_por_categoria` (importe como texto). */
export interface FilaIngresoCategoria {
  categoria_id: string;
  nombre: string;
  color: string;
  ingreso: string;
}

export interface IngresoCategoria {
  id: string;
  nombre: string;
  color: string;
  importe: string;
  /** % sobre el total de ingresos, 4 decimales ('95.2632'); null si el total es 0. */
  porcentaje: string | null;
}

/**
 * Ingresos por categoría de ingreso (sección 8: nunca se mezclan con las de gasto) con su % sobre
 * el total de ingresos del tramo. Las sumas y el orden (de mayor a menor) vienen de SQL.
 */
export function repartirIngresos(filas: readonly FilaIngresoCategoria[]): IngresoCategoria[] {
  const conCentimos = filas.map((f) => ({ ...f, c: aCentimos(f.ingreso) }));
  const total = conCentimos.reduce((s, x) => s + x.c, 0n);
  return conCentimos
    .filter((x) => x.c !== 0n)
    .map((x) => ({
      id: x.categoria_id,
      nombre: x.nombre,
      color: x.color,
      importe: desdeCentimos(x.c),
      porcentaje: porcentajeDe(x.c, total),
    }));
}

/**
 * parte / total × 100 con 4 decimales exactos (mitades alejándose de cero), listo para
 * `formatearPorcentaje`. null si el total es 0 o negativo (no hay base sobre la que repartir).
 */
export function porcentajeDe(parte: bigint, total: bigint): string | null {
  if (total <= 0n) return null;
  const numerador = parte * 1_000_000n;
  let cociente = numerador / total;
  const resto = numerador % total;
  if (2n * (resto < 0n ? -resto : resto) >= total) cociente += numerador < 0n ? -1n : 1n;
  const negativo = cociente < 0n;
  const abs = negativo ? -cociente : cociente;
  return `${negativo ? '-' : ''}${(abs / 10_000n).toString()}.${(abs % 10_000n).toString().padStart(4, '0')}`;
}

/**
 * Altura relativa (0–100) de una barra para dibujarla. Única conversión a number permitida:
 * coordenadas de píxel a partir de céntimos bigint, nunca para cálculos de dinero.
 */
export function proporcion(valor: string, maximo: bigint): number {
  if (maximo <= 0n) return 0;
  const c = aCentimos(valor);
  const abs = c < 0n ? -c : c;
  return Number((abs * 10_000n) / maximo) / 100;
}

/** Mayor valor absoluto (céntimos) de una lista de importes; ignora null. */
export function maximoAbsoluto(valores: readonly (string | null)[]): bigint {
  let max = 0n;
  for (const v of valores) {
    if (v === null) continue;
    const c = aCentimos(v);
    const abs = c < 0n ? -c : c;
    if (abs > max) max = abs;
  }
  return max;
}
