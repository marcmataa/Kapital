/**
 * Migración 20261103000000_devoluciones_imputadas.sql (M1): una devolución vinculada resta en el
 * día, el mes y la categoría de su compra; la fecha real (saldo, patrimonio, lista de movimientos)
 * no cambia; la variación patrimonial lleva la pieza «devoluciones desplazadas»
 * (docs/reglas-financieras.md, secciones 3, 5, 7, 8, 9 y 11). Cifras inventadas, salvo el balance
 * de septiembre de la sección 11 (cifras reales del documento).
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACIONES, MIGRACION_DEVOLUCIONES_IMPUTADAS, ROLLBACK_DEVOLUCIONES_IMPUTADAS, actuarComo, conRol, crearCategoria,
  crearCuenta, crearDb, crearUsuario, devolucionAntigua, mov, patrimonio, resumen, todas, una, valorCuenta,
} from './helpers.js';

let db: PGlite;
let u: string;
let bbva: string;
let ocio: string;
let comida: string;
let otros: string;
let nomina: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  u = await crearUsuario(db);
  bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', fechaInicial: '2024-01-01', principal: true });
  ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  comida = await crearCategoria(db, u, 'Comida', 'gasto');
  otros = await crearCategoria(db, u, 'Otros gastos', 'gasto');
  nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
});

/** Ejecuta `sql` como `u` desde la app (rol authenticated, como PostgREST). */
async function comoUsuario<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string, params: unknown[] = [],
): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

function gasto(importe: string, fecha: string, categoria = ocio, concepto = 'Compra') {
  return mov(db, u, { tipo: 'gasto', importe, fecha, cuenta: bbva, categoria, metodo: 'tarjeta', concepto });
}

function devolver(gastoId: string, importe: string, fecha: string) {
  return mov(db, u, { tipo: 'devolucion', importe, fecha, cuenta: bbva, devolucionDe: gastoId, metodo: 'bizum', concepto: 'Bizum' });
}

async function gastoCategoria(desde: string, hasta: string): Promise<Record<string, string>> {
  const filas = await comoUsuario<{ nombre: string; gasto: string }>(
    `select nombre, gasto::text from gasto_por_categoria($1, $2)`, [desde, hasta],
  );
  return Object.fromEntries(filas.map((f) => [f.nombre, f.gasto]));
}

async function porDia(desde: string, hasta: string): Promise<Record<string, string>> {
  const filas = await comoUsuario<{ fecha: string; gasto_neto: string }>(
    `select fecha::text, gasto_neto::text from gasto_por_dia($1, $2)`, [desde, hasta],
  );
  return Object.fromEntries(filas.map((f) => [f.fecha, f.gasto_neto]));
}

type Variacion = { balance: string; desplazadas: string; revalorizacion: string; ajustes: string; variacion: string; suma: string };

async function variacion(d1: string, d2: string): Promise<Variacion> {
  const [v] = await comoUsuario<Variacion>(
    `select balance::text, devoluciones_desplazadas::text as desplazadas, revalorizacion::text, ajustes::text,
            variacion::text, (balance + devoluciones_desplazadas + revalorizacion + ajustes)::text as suma
     from variacion_patrimonial($1, $2)`, [d1, d2],
  );
  if (!v) throw new Error('sin variación');
  return v;
}

async function datos(mes: string): Promise<Record<string, unknown>> {
  const [fila] = await comoUsuario<{ d: Record<string, unknown> }>(`select datos_analisis($1) as d`, [mes]);
  if (!fila) throw new Error('sin datos');
  return fila.d;
}

/** Sección 11 · «Devolución en otro mes»: 80 € de Ocio el 28/09 y 20 € devueltos el 03/10. */
async function devolucionEnOtroMes() {
  await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-09-01', cuenta: bbva, categoria: nomina });
  await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-10-01', cuenta: bbva, categoria: nomina });
  const compra = await gasto('80.00', '2026-09-28');
  await gasto('10.00', '2026-10-10', comida);
  return compra;
}

describe('Sección 11 · devolución en otro mes', () => {
  it('80 € de Ocio el 28/09 y 20 € devueltos el 03/10: septiembre 60 € de Ocio, octubre no cambia, ingresos igual', async () => {
    const compra = await devolucionEnOtroMes();
    const octubreAntes = await resumen(db, '2026-10-01', '2026-10-31');
    const categoriasOctubreAntes = await gastoCategoria('2026-10-01', '2026-10-31');

    await devolver(compra, '20.00', '2026-10-03');

    expect(await gastoCategoria('2026-09-01', '2026-09-30')).toEqual({ Ocio: '60.00' });
    const septiembre = await resumen(db, '2026-09-01', '2026-09-30');
    expect(septiembre).toMatchObject({
      ingresos: '1000.00', gastos: '80.00', devoluciones: '20.00', gastos_netos: '60.00', balance: '940.00',
    });
    expect(await resumen(db, '2026-10-01', '2026-10-31')).toEqual(octubreAntes);
    expect(await gastoCategoria('2026-10-01', '2026-10-31')).toEqual(categoriasOctubreAntes);

    const meses = await comoUsuario<{ mes: string; ingresos: string; gastos_netos: string }>(
      `select mes::text, ingresos::text, gastos_netos::text from resumen_mensual('2026-09-01', '2026-10-31') order by mes`,
    );
    expect(meses).toEqual([
      { mes: '2026-09-01', ingresos: '1000.00', gastos_netos: '60.00' },
      { mes: '2026-10-01', ingresos: '1000.00', gastos_netos: '10.00' },
    ]);
  });

  it('el saldo de la cuenta sube 20,00 € el 03/10 (fecha real), no en septiembre', async () => {
    const compra = await devolucionEnOtroMes();
    await devolver(compra, '20.00', '2026-10-03');
    expect(await valorCuenta(db, bbva, '2026-09-30')).toBe('1920.00');
    expect(await valorCuenta(db, bbva, '2026-10-02')).toBe('2920.00');
    expect(await valorCuenta(db, bbva, '2026-10-03')).toBe('2940.00');
  });

  it('devoluciones desplazadas: −20,00 € en la variación de septiembre y +20,00 € en la de octubre', async () => {
    const compra = await devolucionEnOtroMes();
    await devolver(compra, '20.00', '2026-10-03');

    const sep = await variacion('2026-08-31', '2026-09-30');
    expect(sep).toMatchObject({ balance: '940.00', desplazadas: '-20.00', variacion: '920.00' });
    expect(sep.suma).toBe(sep.variacion);

    const oct = await variacion('2026-09-30', '2026-10-31');
    expect(oct).toMatchObject({ balance: '990.00', desplazadas: '20.00', variacion: '1010.00' });
    expect(oct.suma).toBe(oct.variacion);
  });
});

describe('Sección 11 · devoluciones desplazadas sin duplicar', () => {
  it('la suma de septiembre y octubre es 0,00 €; los 20 € suben el patrimonio una vez (03/10) y restan del gasto una vez (septiembre)', async () => {
    const compra = await devolucionEnOtroMes();
    await devolver(compra, '20.00', '2026-10-03');

    const sep = await variacion('2026-08-31', '2026-09-30');
    const oct = await variacion('2026-09-30', '2026-10-31');
    const { suma } = await una<{ suma: string }>(
      db, `select ($1::numeric + $2::numeric)::text as suma`, [sep.desplazadas, oct.desplazadas],
    );
    expect(suma).toBe('0.00');

    // Un periodo que contiene la compra y el reembolso: la devolución no entra en la pieza.
    const dos = await variacion('2026-08-31', '2026-10-31');
    expect(dos).toMatchObject({ desplazadas: '0.00', balance: '1930.00', variacion: '1930.00' });

    // Patrimonio: sube 20 € solo el 03/10.
    expect(await patrimonio(db, '2026-10-02')).toBe('2920.00');
    expect(await patrimonio(db, '2026-10-03')).toBe('2940.00');
    // Gasto: 60 € en septiembre + 10 € en octubre = 70 € (80 + 10 − 20, una sola vez).
    const total = await resumen(db, '2026-09-01', '2026-10-31');
    expect(total.gastos_netos).toBe('70.00');
    expect(total.devoluciones).toBe('20.00');
  });

  it('con compra y reembolso en el mismo mes la pieza vale 0', async () => {
    const compra = await gasto('50.00', '2026-10-02');
    await devolver(compra, '50.00', '2026-10-20');
    expect((await variacion('2026-09-30', '2026-10-31')).desplazadas).toBe('0.00');
    expect(await gastoCategoria('2026-10-01', '2026-10-31')).toEqual({ Ocio: '0.00' });
  });
});

describe('Sección 11 · balance de septiembre (cifras reales)', () => {
  it('1.508,00 € de ingresos y 1.168,28 € de gastos netos → 339,72 € y 22,5 %, aunque la devolución llegue en octubre', async () => {
    const otrosIngresos = await crearCategoria(db, u, 'Otros ingresos', 'ingreso');
    const restaurantes = await crearCategoria(db, u, 'Restaurantes', 'gasto');
    await mov(db, u, { tipo: 'ingreso', importe: '1258.00', fecha: '2026-09-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'ingreso', importe: '250.00', fecha: '2026-09-15', cuenta: bbva, categoria: otrosIngresos });
    await gasto('1000.00', '2026-09-05', restaurantes);
    const ocioSep = await gasto('198.28', '2026-09-20');
    // La devolución de 30 € de la compra de septiembre llega en octubre: sigue contando en septiembre.
    await devolver(ocioSep, '30.00', '2026-10-02');
    // Una compra de agosto devuelta en septiembre no cuenta en septiembre.
    const agosto = await gasto('40.00', '2026-08-30');
    await devolver(agosto, '40.00', '2026-09-02');

    const r = await resumen(db, '2026-09-01', '2026-09-30');
    expect(r.ingresos).toBe('1508.00');
    expect(r.gastos_netos).toBe('1168.28');
    expect(r.balance).toBe('339.72');
    expect(r.ahorro_1d).toBe('22.5');
  });
});

describe('Sección 11 · devoluciones de amigos', () => {
  it('100 € de entradas y 4 Bizum de 15 € (dos en el mes siguiente) → 40,00 € de Ocio en el mes de las entradas', async () => {
    const entradas = await gasto('100.00', '2026-10-30', ocio, 'Entradas');
    await devolver(entradas, '15.00', '2026-10-30');
    await devolver(entradas, '15.00', '2026-10-31');
    await devolver(entradas, '15.00', '2026-11-01');
    await devolver(entradas, '15.00', '2026-11-02');

    expect(await gastoCategoria('2026-10-01', '2026-10-31')).toEqual({ Ocio: '40.00' });
    expect(await gastoCategoria('2026-11-01', '2026-11-30')).toEqual({});
    const oct = await resumen(db, '2026-10-01', '2026-10-31');
    expect(oct).toMatchObject({ ingresos: '0.00', gastos_netos: '40.00' });
    expect((await resumen(db, '2026-11-01', '2026-11-30')).gastos_netos).toBe('0.00');
  });
});

describe('Sección 11 · categoría en negativo (solo devoluciones sin vincular)', () => {
  it('Otros gastos con 20 € de gasto y 50 € de devoluciones sin vincular → −30,00 €; las vinculadas nunca dejan negativo', async () => {
    await gasto('20.00', '2026-10-02', otros);
    await devolucionAntigua(db, u, { tipo: 'devolucion', importe: '50.00', fecha: '2026-10-09', cuenta: bbva, categoria: otros });
    // Una vinculada de una compra de septiembre llega en octubre: no deja Ocio en negativo en octubre.
    const compra = await gasto('80.00', '2026-09-28');
    await devolver(compra, '80.00', '2026-10-05');

    expect(await gastoCategoria('2026-10-01', '2026-10-31')).toEqual({ 'Otros gastos': '-30.00' });
    expect(await gastoCategoria('2026-09-01', '2026-09-30')).toEqual({ Ocio: '0.00' });
    // peso_otros_gastos solo admite categorías con gasto positivo (gráfico circular).
    expect(await comoUsuario(`select * from peso_otros_gastos('2026-10-01', '2026-10-31')`)).toEqual([]);
  });

  it('una antigua sin vincular sigue restando en su fecha y su categoría', async () => {
    await gasto('30.00', '2026-09-10', comida);
    await devolucionAntigua(db, u, { tipo: 'devolucion', importe: '10.00', fecha: '2026-10-04', cuenta: bbva, categoria: comida });
    expect(await gastoCategoria('2026-09-01', '2026-09-30')).toEqual({ Comida: '30.00' });
    expect(await gastoCategoria('2026-10-01', '2026-10-31')).toEqual({ Comida: '-10.00' });
    expect(await porDia('2026-10-01', '2026-10-31')).toEqual({ '2026-10-04': '-10.00' });
    // Sin vínculo no hay desplazamiento: la pieza vale 0.
    expect((await variacion('2026-09-30', '2026-10-31')).desplazadas).toBe('0.00');
  });

  it('una vinculada antigua con otra categoría (pendiente de revisión) se imputa a la categoría de su compra', async () => {
    const cena = await gasto('40.00', '2026-10-02', ocio);
    await devolucionAntigua(db, u, {
      tipo: 'devolucion', importe: '15.00', fecha: '2026-10-06', cuenta: bbva, categoria: comida, devolucionDe: cena,
    });
    expect(await gastoCategoria('2026-10-01', '2026-10-31')).toEqual({ Ocio: '25.00' });
  });
});

describe('gasto por día: la devolución resta el día de la compra', () => {
  it('200 € un día y 150 € devueltos 10 días después → ese día 50 € y el día del reembolso nada (0 €)', async () => {
    const compra = await gasto('200.00', '2026-10-05');
    await devolver(compra, '150.00', '2026-10-15');

    expect(await porDia('2026-10-01', '2026-10-31')).toEqual({ '2026-10-05': '50.00' });

    const filas = await comoUsuario<{ fecha: string; gastos: string; devoluciones: string; gasto_neto: string; movimientos: unknown[] }>(
      `select fecha::text, gastos::text, devoluciones::text, gasto_neto::text, movimientos
       from movimientos_por_dia('2026-10-01', '2026-10-31')`,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ fecha: '2026-10-05', gastos: '200.00', devoluciones: '150.00', gasto_neto: '50.00' });
    expect(filas[0]?.movimientos).toHaveLength(2);
  });

  it('ningún día queda en negativo por una devolución vinculada, aunque llegue en otro mes', async () => {
    const a = await gasto('30.00', '2026-09-29');
    const b = await gasto('12.50', '2026-10-01');
    await gasto('8.00', '2026-10-20');
    await devolver(a, '30.00', '2026-10-20');
    await devolver(b, '12.50', '2026-10-20');

    const sep = await porDia('2026-09-01', '2026-09-30');
    const oct = await porDia('2026-10-01', '2026-10-31');
    expect(sep).toEqual({ '2026-09-29': '0.00' });
    expect(oct).toEqual({ '2026-10-01': '0.00', '2026-10-20': '8.00' });
    for (const v of [...Object.values(sep), ...Object.values(oct)]) expect(v.startsWith('-')).toBe(false);
  });
});

describe('comparativas, objetivos y media mensual', () => {
  it('comparativa y ritmo del mes cuentan las devoluciones imputadas a sus compras', async () => {
    const compra = await devolucionEnOtroMes();
    await devolver(compra, '20.00', '2026-10-03');
    const [c] = await comoUsuario<{ gastos_netos: string; gastos_netos_anterior: string }>(
      `select gastos_netos::text, gastos_netos_anterior::text
       from comparativa_estadisticas('2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30')`,
    );
    expect(c).toEqual({ gastos_netos: '10.00', gastos_netos_anterior: '60.00' });
    const [r] = await comoUsuario<{ devoluciones: string }>(
      `select devoluciones::text from ritmo_gasto('2026-09-01', '2026-09-30')`,
    );
    expect(r).toEqual({ devoluciones: '20.00' });
  });

  it('una devolución que llega más tarde pasa el límite de un mes cerrado de «excedido» a «dentro del límite»', async () => {
    await db.query(`insert into objetivos (user_id, tipo, categoria_id, importe) values ($1, 'limite_categoria', $2, 100)`, [u, ocio]);
    await db.query(`insert into objetivos (user_id, tipo, importe) values ($1, 'ahorro_mensual', 900)`, [u]);
    await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-09-01', cuenta: bbva, categoria: nomina });
    const compra = await gasto('150.00', '2026-09-12');

    const progreso = () => comoUsuario<{ tipo: string; actual: string; exceso: string | null; restante: string | null }>(
      `select tipo::text, actual::text, exceso::text, restante::text from progreso_objetivos('2026-09-30') order by tipo`,
    );
    expect(await progreso()).toEqual([
      { tipo: 'ahorro_mensual', actual: '850.00', exceso: null, restante: '50.00' },
      { tipo: 'limite_categoria', actual: '150.00', exceso: '50.00', restante: null },
    ]);

    await devolver(compra, '60.00', '2026-10-04');
    expect(await progreso()).toEqual([
      { tipo: 'ahorro_mensual', actual: '910.00', exceso: null, restante: null },
      { tipo: 'limite_categoria', actual: '90.00', exceso: null, restante: null },
    ]);
    const d = await datos('2026-09-01');
    expect(d.objetivos).toEqual([
      { tipo: 'ahorro_mensual', categoria: null, clave: null, etiqueta: null, importe: '900.00', actual: '910.00' },
      { tipo: 'limite_categoria', categoria: 'Ocio', clave: null, etiqueta: 'Ocio', importe: '100.00', actual: '90.00' },
    ]);
  });

  it('media mensual: la devolución de este mes de una compra del mes pasado (cerrado) baja su media; una sin vincular no', async () => {
    const { anterior, actual } = await una<{ anterior: string; actual: string }>(
      db,
      `select (date_trunc('month', hoy_usuario()) - interval '1 month')::date::text as anterior,
              date_trunc('month', hoy_usuario())::date::text as actual`,
    );
    const media = async () => (await comoUsuario<{ media: string; meses: number }>(
      `select round(media, 2)::text as media, meses from media_gasto_categoria($1, 1)`, [ocio],
    ))[0];

    const compra = await gasto('100.00', anterior);
    expect(await media()).toEqual({ media: '100.00', meses: 1 });
    await devolver(compra, '40.00', actual);
    expect(await media()).toEqual({ media: '60.00', meses: 1 });
    // Una antigua sin vincular de este mes resta en este mes (que no entra en la media).
    await devolucionAntigua(db, u, { tipo: 'devolucion', importe: '5.00', fecha: actual, cuenta: bbva, categoria: ocio });
    expect(await media()).toEqual({ media: '60.00', meses: 1 });
  });
});

describe('datos_analisis', () => {
  it('categorías, cascada, fin de semana y variación con la devolución imputada; métodos sin restarla', async () => {
    await mov(db, u, { tipo: 'ingreso', importe: '500.00', fecha: '2026-09-01', cuenta: bbva, categoria: nomina });
    // 26/09/2026 es sábado; el reembolso llega un martes de octubre.
    const finde = await gasto('50.00', '2026-09-26');
    await devolver(finde, '20.00', '2026-10-06');

    const d = await datos('2026-09-01') as {
      resumen: Record<string, string>; categorias: { nombre: string; gasto: string }[];
      fin_de_semana: { gasto_neto: string }; metodos: unknown[]; cascada: { tipo: string; importe: string }[];
      variacion: Record<string, string>;
    };
    expect(d.resumen).toMatchObject({ gastos: '50.00', devoluciones: '20.00', gastos_netos: '30.00', balance: '470.00' });
    expect(d.categorias.map((c) => [c.nombre, c.gasto])).toEqual([['Ocio', '30.00']]);
    expect(d.fin_de_semana.gasto_neto).toBe('30.00');
    expect(d.metodos).toEqual([{ metodo: 'tarjeta', gasto: '50.00' }]);
    expect(d.cascada.at(-1)).toMatchObject({ tipo: 'balance', importe: '470.00' });
    expect(d.variacion).toMatchObject({ balance: '470.00', devoluciones_desplazadas: '-20.00', variacion: '450.00' });

    const oct = await datos('2026-10-01') as { variacion: Record<string, string>; resumen: Record<string, string> };
    expect(oct.resumen.devoluciones).toBe('0.00');
    expect(oct.variacion.devoluciones_desplazadas).toBe('20.00');
  });
});

describe('la lista de movimientos sigue por la fecha real (sección 8)', () => {
  it('resumen del filtro, subtotales por día y métodos de pago no cambian con la imputación', async () => {
    const compra = await devolucionEnOtroMes();
    await devolver(compra, '20.00', '2026-10-03');

    const [filtro] = await comoUsuario<Record<string, string>>(
      `select ingresos::text, gastos::text, devoluciones::text from resumen_filtro(p_desde => '2026-10-01', p_hasta => '2026-10-31')`,
    );
    expect(filtro).toEqual({ ingresos: '1000.00', gastos: '10.00', devoluciones: '20.00' });
    const dias = await comoUsuario<{ fecha: string; balance: string }>(
      `select fecha::text, balance::text from subtotales_por_dia(p_desde => '2026-10-01', p_hasta => '2026-10-31')`,
    );
    expect(dias).toContainEqual({ fecha: '2026-10-03', balance: '20.00' });
    const metodos = await comoUsuario(`select metodo::text, gasto::text from gasto_por_metodo('2026-09-01', '2026-09-30')`);
    expect(metodos).toEqual([{ metodo: 'tarjeta', gasto: '80.00' }]);
  });
});

describe('permisos', () => {
  it('la vista solo la lee authenticated, y cada usuario ve solo sus movimientos', async () => {
    const compra = await gasto('10.00', '2026-10-01');
    await devolver(compra, '5.00', '2026-10-02');
    expect(await comoUsuario(`select id from v_movimientos_imputados`)).toHaveLength(2);
    const privilegios = await todas<{ rol: string; p: string }>(
      db,
      `select r.rol, string_agg(p.p, ',' order by p.p) as p
       from (values ('anon'), ('authenticated')) r (rol)
       cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (p)
       where has_table_privilege(r.rol, 'v_movimientos_imputados', p.p)
       group by r.rol`,
    );
    expect(privilegios).toEqual([{ rol: 'authenticated', p: 'select' }]);

    await crearUsuario(db); // actuarComo(otro)
    const otro = await conRol(db, 'authenticated', async () => (await db.query(`select id from v_movimientos_imputados`)).rows);
    expect(otro).toEqual([]);

    await actuarComo(db, null);
    await expect(conRol(db, 'anon', () => db.query(`select * from v_movimientos_imputados`))).rejects.toThrow(/permission denied/);
    await expect(conRol(db, 'anon', () => db.query(`select * from variacion_patrimonial('2026-09-30', '2026-10-31')`)))
      .rejects.toThrow(/permission denied/);
  });
});

describe('rollback', () => {
  const FUNCIONES = [
    'resumen_periodo', 'gasto_por_categoria', 'gasto_por_dia', 'movimientos_por_dia', 'media_gasto_categoria',
    'variacion_patrimonial', 'datos_analisis',
  ];
  const definiciones = (base: PGlite) => todas<{ fn: string; def: string; acl: string | null }>(
    base,
    // Sin \r: en Windows los .sql pueden tener CRLF y el cuerpo se guarda tal cual.
    `select p.proname as fn, replace(pg_get_functiondef(p.oid), E'\\r', '') as def, p.proacl::text as acl
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) order by p.proname`,
    [FUNCIONES],
  );

  it('el down restaura las definiciones y permisos anteriores exactos, quita la vista y la migración se puede volver a aplicar', async () => {
    const anterior = await crearDb({ hasta: MIGRACIONES.length - 1 });
    const limpia = await crearDb();
    try {
      const esperadas = await definiciones(anterior);
      await limpia.exec(ROLLBACK_DEVOLUCIONES_IMPUTADAS);
      expect(await definiciones(limpia)).toEqual(esperadas);
      expect(await todas(limpia, `select 1 from pg_class where relname = 'v_movimientos_imputados'`)).toEqual([]);

      // Con el down, la devolución vuelve a restar en su propia fecha.
      const v = await crearUsuario(limpia);
      const cuenta = await crearCuenta(limpia, v, { nombre: 'BBVA', saldoInicial: '100.00', fechaInicial: '2026-01-01' });
      const cat = await crearCategoria(limpia, v, 'Ocio', 'gasto');
      const cena = await mov(limpia, v, { tipo: 'gasto', importe: '80.00', fecha: '2026-09-28', cuenta, categoria: cat });
      await mov(limpia, v, { tipo: 'devolucion', importe: '20.00', fecha: '2026-10-03', cuenta, categoria: cat, devolucionDe: cena });
      expect((await resumen(limpia, '2026-09-01', '2026-09-30')).gastos_netos).toBe('80.00');

      await limpia.exec(MIGRACION_DEVOLUCIONES_IMPUTADAS);
      expect((await resumen(limpia, '2026-09-01', '2026-09-30')).gastos_netos).toBe('60.00');
    } finally {
      await anterior.close();
      await limpia.close();
    }
  });

  it('el down quita devoluciones_desplazadas de los análisis guardados', async () => {
    const limpia = await crearDb();
    try {
      const v = await crearUsuario(limpia);
      await limpia.query(
        `insert into analisis_mensuales (user_id, mes, estado, datos)
         values ($1, '2026-09-01', 'listo', '{"variacion": {"balance": "1.00", "devoluciones_desplazadas": "-2.00"}}')`,
        [v],
      );
      await limpia.exec(ROLLBACK_DEVOLUCIONES_IMPUTADAS);
      expect((await una(limpia, `select datos -> 'variacion' as d from analisis_mensuales where user_id = $1`, [v])).d)
        .toEqual({ balance: '1.00' });
    } finally {
      await limpia.close();
    }
  });
});
