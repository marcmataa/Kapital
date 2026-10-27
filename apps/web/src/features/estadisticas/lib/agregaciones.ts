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

/** Cómo se ordenan las filas comparadas: por importe actual o por lo que más ha cambiado. */
export type OrdenFilas = 'importe' | 'variacion';

/** Actual − Anterior en céntimos; null si no hay periodo anterior. */
export function diferenciaFila(f: Pick<FilaComparada, 'actual' | 'anterior'>): bigint | null {
  return f.anterior === null ? null : aCentimos(f.actual) - aCentimos(f.anterior);
}

const absoluto = (c: bigint) => (c < 0n ? -c : c);

/**
 * Empareja por id las filas del periodo actual y del anterior (las que solo están en uno salen
 * con 0,00 € en el otro). Orden 'importe' (por defecto): de mayor a menor importe actual.
 * Orden 'variacion': de mayor a menor diferencia en valor absoluto (lo que más explica el cambio
 * arriba). `hayAnterior` = false deja `anterior` a null en todas.
 */
export function emparejar(
  actual: readonly { id: string; nombre: string; color?: string; importe: string }[],
  anterior: readonly { id: string; nombre: string; color?: string; importe: string }[],
  hayAnterior: boolean,
  orden: OrdenFilas = 'importe',
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
  const porImporte = (a: FilaComparada, b: FilaComparada) =>
    compararImportes(b.actual, a.actual) || compararImportes(b.anterior ?? '0', a.anterior ?? '0') || a.nombre.localeCompare(b.nombre);
  const porVariacion = (a: FilaComparada, b: FilaComparada) => {
    const da = absoluto(diferenciaFila(a) ?? 0n);
    const db = absoluto(diferenciaFila(b) ?? 0n);
    return da === db ? porImporte(a, b) : db > da ? 1 : -1;
  };
  return filas.sort(orden === 'variacion' && hayAnterior ? porVariacion : porImporte);
}

/** Paso de la cascada «por qué cambia el balance» (de mes anterior a este mes). */
export interface PasoVariacion {
  id: string;
  /** inicio/fin: balance de cada periodo (barra de total); el resto, lo que suma o resta al balance. */
  tipo: 'inicio' | 'ingresos' | 'categoria' | 'resto' | 'fin';
  nombre?: string;
  /** Categorías agrupadas en «Resto». */
  agrupadas?: number;
  /** Efecto en el balance (pasos) o balance (totales), con signo. */
  importe: string;
  /** Acumulados exactos antes y después del paso. */
  inicio: string;
  fin: string;
}

/** Categorías con cambio que se muestran una a una; el resto va en un paso «Resto (N categorías)». */
export const MAX_CATEGORIAS_CASCADA = 6;

/**
 * Cascada de la variación del balance (sección 3: Balance = Ingresos − Gastos netos):
 *   Balance anterior + Δ ingresos − Σ Δ gasto neto de cada categoría = Balance actual.
 * Una categoría en la que gastas más resta al balance (paso negativo); una en la que gastas menos,
 * suma. Los totales (balance de cada periodo y de ingresos) vienen de SQL (comparativa); el
 * reparto por categoría, de gasto_por_categoria. Solo se resta en céntimos bigint.
 *
 * Devuelve null si no hay periodo anterior o si la suma de los pasos no da exactamente el balance
 * de SQL (nunca se dibuja una explicación que no cuadra).
 */
export function pasosVariacionBalance(
  totales: { ingresos: string; ingresosAnterior: string | null; balance: string; balanceAnterior: string | null },
  gastos: readonly { id: string; nombre: string; importe: string }[],
  gastosAnterior: readonly { id: string; nombre: string; importe: string }[],
): PasoVariacion[] | null {
  if (totales.balanceAnterior === null || totales.ingresosAnterior === null) return null;
  const efectos: { id: string; tipo: 'ingresos' | 'categoria'; nombre?: string; efecto: bigint }[] = [];
  const dIngresos = aCentimos(totales.ingresos) - aCentimos(totales.ingresosAnterior);
  if (dIngresos !== 0n) efectos.push({ id: 'ingresos', tipo: 'ingresos', efecto: dIngresos });

  const categorias = emparejar(
    gastos.map((g) => ({ id: g.id, nombre: g.nombre, importe: g.importe })),
    gastosAnterior.map((g) => ({ id: g.id, nombre: g.nombre, importe: g.importe })),
    true,
    'variacion',
  )
    .map((f) => ({ id: f.id, nombre: f.nombre, efecto: -(diferenciaFila(f) ?? 0n) }))
    .filter((f) => f.efecto !== 0n);
  const sueltas = categorias.length > MAX_CATEGORIAS_CASCADA + 1 ? categorias.slice(0, MAX_CATEGORIAS_CASCADA) : categorias;
  const agrupadas = categorias.slice(sueltas.length);
  for (const c of sueltas) efectos.push({ id: c.id, tipo: 'categoria', nombre: c.nombre, efecto: c.efecto });

  const pasos: PasoVariacion[] = [];
  const balanceAnterior = aCentimos(totales.balanceAnterior);
  pasos.push({ id: 'inicio', tipo: 'inicio', importe: totales.balanceAnterior, inicio: '0.00', fin: totales.balanceAnterior });
  let acumulado = balanceAnterior;
  const anadir = (id: string, tipo: PasoVariacion['tipo'], efecto: bigint, extra: Partial<PasoVariacion> = {}) => {
    pasos.push({ id, tipo, importe: desdeCentimos(efecto), inicio: desdeCentimos(acumulado), fin: desdeCentimos(acumulado + efecto), ...extra });
    acumulado += efecto;
  };
  for (const e of efectos) anadir(e.id, e.tipo, e.efecto, e.nombre !== undefined ? { nombre: e.nombre } : {});
  if (agrupadas.length > 0) {
    anadir('resto', 'resto', agrupadas.reduce((s, c) => s + c.efecto, 0n), { agrupadas: agrupadas.length });
  }
  if (acumulado !== aCentimos(totales.balance)) return null;
  pasos.push({ id: 'fin', tipo: 'fin', importe: totales.balance, inicio: '0.00', fin: totales.balance });
  return pasos;
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
