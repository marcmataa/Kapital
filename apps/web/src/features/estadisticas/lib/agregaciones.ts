import { aCentimos, desdeCentimos } from '@/shared/lib/dinero';
import { componerFecha, diasDelMes, inicioDeMes, partesDe } from '@/shared/lib/fechas';

/*
 * Agregaciones en el cliente. Siempre en céntimos `bigint` (nunca parseFloat/Number sobre importes).
 * Las sumas «oficiales» (balance, gastos netos, categorías) las hace SQL; aquí solo se reparte
 * por día o por categoría de ingreso lo que la base no da agrupado.
 */

export type TipoMovimiento = 'gasto' | 'ingreso' | 'devolucion' | 'traspaso' | 'ajuste';

export interface MovimientoLigero {
  fecha: string;
  tipo: TipoMovimiento;
  /** Importe positivo como texto ('38.50'). */
  importe: string;
  categoria_id: string | null;
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
 * Gasto neto por día del mes de `mes` (sección 3: gastos − devoluciones; traspasos, ajustes
 * e ingresos no cuentan). Los días posteriores a `hoy` quedan vacíos (null).
 */
export function gastoNetoPorDia(movimientos: readonly MovimientoLigero[], mes: string, hoy: string): GastoDia[] {
  const { anio, mes: m } = partesDe(inicioDeMes(mes));
  const porFecha = new Map<string, bigint>();
  for (const mov of movimientos) {
    if (mov.tipo !== 'gasto' && mov.tipo !== 'devolucion') continue;
    const c = aCentimos(mov.importe);
    porFecha.set(mov.fecha, (porFecha.get(mov.fecha) ?? 0n) + (mov.tipo === 'gasto' ? c : -c));
  }
  return Array.from({ length: diasDelMes(anio, m) }, (_, i) => {
    const fecha = componerFecha({ anio, mes: m, dia: i + 1 });
    return {
      dia: i + 1,
      fecha,
      gasto: fecha > hoy ? null : desdeCentimos(porFecha.get(fecha) ?? 0n),
      hoy: fecha === hoy,
    };
  });
}

export interface CategoriaIngresoRef {
  id: string;
  nombre: string;
  color: string;
  tipo: 'gasto' | 'ingreso';
  orden: number;
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
 * Ingresos por categoría de ingreso (sección 8: nunca se mezclan con las de gasto).
 * Solo cuentan movimientos de tipo ingreso; las devoluciones restan del gasto, no aparecen aquí.
 */
export function ingresosPorCategoria(
  movimientos: readonly MovimientoLigero[],
  categorias: readonly CategoriaIngresoRef[],
): IngresoCategoria[] {
  const deIngreso = new Map(categorias.filter((c) => c.tipo === 'ingreso').map((c) => [c.id, c]));
  const sumas = new Map<string, bigint>();
  for (const mov of movimientos) {
    if (mov.tipo !== 'ingreso' || mov.categoria_id === null || !deIngreso.has(mov.categoria_id)) continue;
    sumas.set(mov.categoria_id, (sumas.get(mov.categoria_id) ?? 0n) + aCentimos(mov.importe));
  }
  let total = 0n;
  for (const v of sumas.values()) total += v;
  return [...sumas.entries()]
    .map(([id, c]) => {
      const cat = deIngreso.get(id);
      return { cat, c, id };
    })
    .filter((x): x is { cat: CategoriaIngresoRef; c: bigint; id: string } => x.cat !== undefined)
    .sort((a, b) => (a.c === b.c ? a.cat.orden - b.cat.orden : a.c > b.c ? -1 : 1))
    .map(({ cat, c, id }) => ({
      id,
      nombre: cat.nombre,
      color: cat.color,
      importe: desdeCentimos(c),
      porcentaje: porcentajeDe(c, total),
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
 * Reparte el gasto por categoría (sección 8): % sobre los gastos netos del mes (todas juntas
 * suman 100 %); las negativas se muestran en negativo pero no entran en el gráfico circular.
 * Las de gasto 0 no se muestran.
 */
export function repartirCategorias(categorias: readonly CategoriaGasto[], gastosNetos: string): RepartoCategorias {
  const total = aCentimos(gastosNetos);
  const conPct = categorias
    .map((c) => ({ ...c, c: aCentimos(c.gasto) }))
    .sort((a, b) => (a.c === b.c ? a.nombre.localeCompare(b.nombre) : a.c > b.c ? -1 : 1))
    .map(({ c, ...resto }) => ({ ...resto, c, porcentaje: porcentajeDe(c, total) }));
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
