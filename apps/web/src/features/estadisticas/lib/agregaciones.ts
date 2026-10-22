import { aCentimos, desdeCentimos } from '@/shared/lib/dinero';
import { componerFecha, diasDelMes, inicioDeMes, partesDe } from '@/shared/lib/fechas';

/*
 * Presentación de agregados en el cliente. Las sumas las hace SQL (gasto_por_dia,
 * ingresos_por_categoria, gasto_por_categoria…); aquí solo se completa la serie de días y se
 * reparten porcentajes, siempre en céntimos `bigint` (nunca parseFloat/Number sobre importes).
 */

/** Fila de `gasto_por_dia` (solo días con gastos o devoluciones; importe como texto). */
export interface FilaGastoDia {
  fecha: string;
  gasto_neto: string;
}

export interface GastoDia {
  dia: number;
  fecha: string;
  /** Gasto neto del día (gastos − devoluciones); null en días futuros (no se dibujan). */
  gasto: string | null;
  /** true para hoy: el valor es provisional. */
  hoy: boolean;
}

/**
 * Serie de todos los días del mes de `mes` a partir de `gasto_por_dia` (sección 3: gastos −
 * devoluciones). Los días sin filas valen 0,00 €; los posteriores a `hoy` quedan vacíos (null).
 */
export function serieGastoDiario(filas: readonly FilaGastoDia[], mes: string, hoy: string): GastoDia[] {
  const { anio, mes: m } = partesDe(inicioDeMes(mes));
  const porFecha = new Map(filas.map((f) => [f.fecha, f.gasto_neto]));
  return Array.from({ length: diasDelMes(anio, m) }, (_, i) => {
    const fecha = componerFecha({ anio, mes: m, dia: i + 1 });
    const valor = porFecha.get(fecha);
    return {
      dia: i + 1,
      fecha,
      gasto: fecha > hoy ? null : valor === undefined ? '0.00' : desdeCentimos(aCentimos(valor)),
      hoy: fecha === hoy,
    };
  });
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

export interface CategoriaGasto {
  categoria_id: string;
  nombre: string;
  color: string;
  gasto: string;
}

export interface RepartoCategorias {
  /** Categorías con gasto neto > 0: entran en el gráfico. Ordenadas de mayor a menor. */
  positivas: (CategoriaGasto & { porcentaje: string | null })[];
  /** Categorías con gasto neto < 0 (te devolvieron más de lo que gastaste): se listan aparte. */
  negativas: (CategoriaGasto & { porcentaje: string | null })[];
}

/**
 * Reparte el gasto por categoría (sección 8): el % de cada categoría es sobre la suma de las
 * categorías con gasto positivo, así que las del gráfico suman siempre 100 %. Las negativas se
 * muestran aparte, con su número en negativo y sin porcentaje. Las de gasto 0 no se muestran.
 */
export function repartirCategorias(categorias: readonly CategoriaGasto[]): RepartoCategorias {
  const conCentimos = categorias.map((c) => ({ ...c, c: aCentimos(c.gasto) }));
  const total = conCentimos.reduce((s, x) => (x.c > 0n ? s + x.c : s), 0n);
  const conPct = conCentimos
    .sort((a, b) => (a.c === b.c ? a.nombre.localeCompare(b.nombre) : a.c > b.c ? -1 : 1))
    .map((x) => ({ ...x, porcentaje: x.c > 0n ? porcentajeDe(x.c, total) : null }));
  const limpiar = ({ c: _c, ...resto }: (typeof conPct)[number]) => resto;
  return {
    positivas: conPct.filter((x) => x.c > 0n).map(limpiar),
    negativas: conPct.filter((x) => x.c < 0n).map(limpiar),
  };
}

/**
 * Media mensual del balance (sección 8): solo meses completos. Un mes es completo si ya terminó
 * (anterior al mes de `hoy`) y los datos empiezan como tarde su día 1. Redondeo al céntimo
 * (mitades alejándose de cero). null si no hay ningún mes completo («—»).
 */
export function mediaMensual(
  meses: readonly { mes: string; balance: string }[],
  hoy: string,
  inicioDatos: string | null,
): string | null {
  if (inicioDatos === null) return null;
  const mesActual = inicioDeMes(hoy);
  const completos = meses.filter((m) => m.mes < mesActual && inicioDatos <= m.mes);
  if (completos.length === 0) return null;
  let suma = 0n;
  for (const m of completos) suma += aCentimos(m.balance);
  const n = BigInt(completos.length);
  let media = suma / n;
  const resto = suma % n;
  if (2n * (resto < 0n ? -resto : resto) >= n) media += suma < 0n ? -1n : 1n;
  return desdeCentimos(media);
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
