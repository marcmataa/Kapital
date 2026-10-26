/**
 * Migración 20261024000001_movimientos_ux.sql: totales de la lista (chips, subtotal por día,
 * resumen del filtro), sugerencia de categoría, categorías más usadas, gastos devolvibles,
 * ajuste por saldo real, media mensual de una categoría y crear_banco con fecha de partida.
 * Datos inventados.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_MOVIMIENTOS_UX, ROLLBACK_MOVIMIENTOS_UX, actuarComo, conRol, crearCategoria, crearCuenta, crearDb,
  crearUsuario, mov, todas, una, valorCuenta,
} from './helpers.js';

let db: PGlite;
let u: string;
let bbva: string;
let efectivo: string;
let ocio: string;
let comida: string;
let nomina: string;
let cine: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

/** Hoy en Madrid según la base (las funciones usan hoy_usuario()). */
async function hoy(): Promise<string> {
  return (await una<{ d: string }>(db, `select hoy_usuario()::text as d`)).d;
}

beforeEach(async () => {
  u = await crearUsuario(db);
  bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', principal: true });
  efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: '50.00' });
  ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  comida = await crearCategoria(db, u, 'Comida', 'gasto');
  nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');

  // 21/10: dos gastos exactos (0,10 + 0,20), una devolución, un traspaso y un ajuste.
  cine = await mov(db, u, { tipo: 'gasto', importe: '30.00', fecha: '2026-10-21', cuenta: bbva, categoria: ocio, metodo: 'tarjeta', concepto: 'Cine Yelmo' });
  await mov(db, u, { tipo: 'gasto', importe: '0.10', fecha: '2026-10-21', cuenta: efectivo, categoria: comida, metodo: 'efectivo', concepto: 'Chicle' });
  await mov(db, u, { tipo: 'gasto', importe: '0.20', fecha: '2026-10-21', cuenta: efectivo, categoria: comida, metodo: 'efectivo', concepto: 'Caramelo' });
  await mov(db, u, { tipo: 'devolucion', importe: '10.00', fecha: '2026-10-21', cuenta: bbva, categoria: ocio, devolucionDe: cine, concepto: 'Bizum cine' });
  await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-10-21', cuenta: bbva, destino: efectivo, concepto: 'Cajero' });
  await mov(db, u, { tipo: 'ajuste', importe: '5.00', fecha: '2026-10-21', cuenta: bbva, sentido: 'resta', concepto: 'Cuadre' });
  // 20/10: nómina. 19/10: solo un traspaso (sin balance).
  await mov(db, u, { tipo: 'ingreso', importe: '1258.00', fecha: '2026-10-20', cuenta: bbva, categoria: nomina, metodo: 'transferencia', concepto: 'Nómina' });
  await mov(db, u, { tipo: 'traspaso', importe: '20.00', fecha: '2026-10-19', cuenta: efectivo, destino: bbva, concepto: 'Ingreso en cajero' });
  // Septiembre: historial para la sugerencia.
  await mov(db, u, { tipo: 'gasto', importe: '12.00', fecha: '2026-09-10', cuenta: bbva, categoria: ocio, metodo: 'tarjeta', concepto: 'cine yelmo' });
  await mov(db, u, { tipo: 'gasto', importe: '8.00', fecha: '2026-09-11', cuenta: bbva, categoria: comida, metodo: 'tarjeta', concepto: 'Cinemanía palomitas' });

  // Otro usuario con los mismos conceptos y fechas: nunca aparece.
  const otro = await crearUsuario(db);
  const suya = await crearCuenta(db, otro, { nombre: 'BBVA' });
  const suOcio = await crearCategoria(db, otro, 'Ocio', 'gasto');
  await mov(db, otro, { tipo: 'gasto', importe: '500.00', fecha: '2026-10-21', cuenta: suya, categoria: suOcio, metodo: 'tarjeta', concepto: 'Cine Yelmo' });
});

describe('totales_por_tipo (chips)', () => {
  it('número y total de cada tipo con los filtros de la lista; los ajustes, netos', async () => {
    const filas = await comoUsuario<{ tipo: string; n: number; total: string }>(
      `select tipo, n, total::text from totales_por_tipo(p_desde => '2026-10-01', p_hasta => '2026-10-31')`,
    );
    expect(filas).toEqual([
      { tipo: 'gasto', n: 3, total: '30.30' },
      { tipo: 'ingreso', n: 1, total: '1258.00' },
      { tipo: 'devolucion', n: 1, total: '10.00' },
      { tipo: 'traspaso', n: 2, total: '120.00' },
      { tipo: 'ajuste', n: 1, total: '-5.00' },
    ]);
  });

  it('búsqueda literal (los comodines no cuentan) y cuenta de origen o destino', async () => {
    const porTexto = await comoUsuario<{ tipo: string; n: number }>(`select tipo, n from totales_por_tipo(p_q => 'cine')`);
    // «Cine Yelmo», «cine yelmo», «Cinemanía palomitas» y la devolución «Bizum cine».
    expect(porTexto).toEqual([{ tipo: 'gasto', n: 3 }, { tipo: 'devolucion', n: 1 }]);
    expect(await comoUsuario(`select * from totales_por_tipo(p_q => '%')`)).toEqual([]);
    const efectivoFilas = await comoUsuario<{ tipo: string; n: number }>(
      `select tipo, n from totales_por_tipo(p_cuenta => $1)`, [efectivo],
    );
    expect(efectivoFilas).toEqual([{ tipo: 'gasto', n: 2 }, { tipo: 'traspaso', n: 2 }]);
  });
});

describe('subtotales_por_dia', () => {
  it('balance del día sin traspasos ni ajustes; un día solo con traspasos no tiene balance', async () => {
    const filas = await comoUsuario<{ fecha: string; n: number; balance: string | null }>(
      `select fecha::text, n, balance::text from subtotales_por_dia(p_desde => '2026-10-19')`,
    );
    expect(filas).toEqual([
      // 10,00 − (30,00 + 0,10 + 0,20) = −20,30
      { fecha: '2026-10-21', n: 6, balance: '-20.30' },
      { fecha: '2026-10-20', n: 1, balance: '1258.00' },
      { fecha: '2026-10-19', n: 1, balance: null },
    ]);
  });

  it('respeta el filtro de tipo', async () => {
    const filas = await comoUsuario<{ fecha: string; balance: string }>(
      `select fecha::text, balance::text from subtotales_por_dia(p_tipo => 'gasto', p_desde => '2026-10-01')`,
    );
    expect(filas).toEqual([{ fecha: '2026-10-21', balance: '-30.30' }]);
  });
});

describe('resumen_filtro', () => {
  it('nº, balance, gasto medio diario y categoría principal del filtro (sección 3 y 8)', async () => {
    const [r] = await comoUsuario<Record<string, string | number | null>>(
      `select n, ingresos::text, gastos::text, devoluciones::text, gastos_netos::text, balance::text, ajustes::text,
              dias, gasto_medio_diario::text as media, categoria_id, categoria_gasto::text
       from resumen_filtro(p_desde => '2026-10-01', p_hasta => '2026-10-31')`,
    );
    expect(r).toMatchObject({
      n: 8, ingresos: '1258.00', gastos: '30.30', devoluciones: '10.00', gastos_netos: '20.30',
      balance: '1237.70', ajustes: '-5.00', dias: 31, categoria_id: ocio, categoria_gasto: '20.00',
    });
    // 20,30 / 31 con precisión completa: se redondea al mostrar.
    expect(Number(String(r?.media).slice(0, 6))).toBe(0.6548);
  });

  it('sin movimientos: n = 0 y nada más', async () => {
    const [r] = await comoUsuario(`select * from resumen_filtro(p_q => 'nada parecido')`);
    expect(r).toMatchObject({ n: 0, balance: null, dias: null, categoria_id: null });
  });
});

describe('sugerir_categoria', () => {
  it('normaliza el concepto (mayúsculas, tildes, números) y elige la categoría más usada', async () => {
    expect((await una<{ n: string }>(db, `select normalizar_concepto('  CINÉ  Yelmo 23/10! ') as n`)).n).toBe('cine yelmo');
    const [r] = await comoUsuario<{ c: string }>(`select sugerir_categoria('Cine yelmo') as c`);
    expect(r?.c).toBe(ocio);
  });

  it('sin coincidencia exacta usa los conceptos que empiezan igual; nada si no hay historial', async () => {
    expect((await comoUsuario<{ c: string }>(`select sugerir_categoria('Cinemania') as c`))[0]?.c).toBe(comida);
    expect((await comoUsuario<{ c: string | null }>(`select sugerir_categoria('Gasolina') as c`))[0]?.c).toBeNull();
    expect((await comoUsuario<{ c: string | null }>(`select sugerir_categoria('Nómina', 'ingreso') as c`))[0]?.c).toBe(nomina);
    // Una categoría de ingreso nunca se sugiere para un gasto.
    expect((await comoUsuario<{ c: string | null }>(`select sugerir_categoria('Nómina') as c`))[0]?.c).toBeNull();
  });

  it('no sugiere categorías archivadas', async () => {
    await db.query(`update categorias set archivada = true where id = $1`, [ocio]);
    expect((await comoUsuario<{ c: string | null }>(`select sugerir_categoria('Cine yelmo') as c`))[0]?.c).toBeNull();
  });
});

describe('categorias_mas_usadas', () => {
  it('las más usadas en los últimos 180 días primero; las que no se usan, con 0', async () => {
    const v = await crearUsuario(db);
    const hoyDb = await hoy();
    const cuenta = await crearCuenta(db, v, { nombre: 'Banco', fechaInicial: '2000-01-01' });
    const a = await crearCategoria(db, v, 'A', 'gasto');
    const b = await crearCategoria(db, v, 'B', 'gasto');
    const c = await crearCategoria(db, v, 'C', 'gasto');
    await crearCategoria(db, v, 'Sueldo', 'ingreso');
    await mov(db, v, { tipo: 'gasto', importe: '1', fecha: hoyDb, cuenta, categoria: b });
    await mov(db, v, { tipo: 'gasto', importe: '1', fecha: hoyDb, cuenta, categoria: a });
    await mov(db, v, { tipo: 'devolucion', importe: '1', fecha: hoyDb, cuenta, categoria: a });
    const antigua = (await una<{ d: string }>(db, `select ($1::date - 200)::text as d`, [hoyDb])).d;
    for (let i = 0; i < 5; i++) await mov(db, v, { tipo: 'gasto', importe: '1', fecha: antigua, cuenta, categoria: c });
    await actuarComo(db, v);
    const filas = await conRol(db, 'authenticated', () => todas(db, `select * from categorias_mas_usadas('gasto')`));
    expect(filas).toEqual([
      { categoria_id: a, usos: 2 },
      { categoria_id: b, usos: 1 },
      { categoria_id: c, usos: 0 },
    ]);
  });
});

describe('gastos_devolvibles', () => {
  it('lo que queda por devolver, con categoría y cuenta para rellenar el formulario', async () => {
    const filas = await comoUsuario<{ id: string; importe: string; pendiente: string; categoria_id: string; cuenta_id: string }>(
      `select id, importe::text, pendiente::text, categoria_id, cuenta_id from gastos_devolvibles()`,
    );
    expect(filas.find((f) => f.id === cine)).toEqual({
      id: cine, importe: '30.00', pendiente: '20.00', categoria_id: ocio, cuenta_id: bbva,
    });
    expect(filas).toHaveLength(5);
  });

  it('un gasto devuelto del todo no se ofrece, salvo al editar la devolución que lo completa', async () => {
    const dev = await mov(db, u, { tipo: 'devolucion', importe: '20.00', fecha: '2026-10-22', cuenta: bbva, categoria: ocio, devolucionDe: cine });
    expect((await comoUsuario<{ id: string }>(`select id from gastos_devolvibles()`)).map((f) => f.id)).not.toContain(cine);
    const editando = await comoUsuario<{ id: string; pendiente: string }>(
      `select id, pendiente::text from gastos_devolvibles($1)`, [dev],
    );
    expect(editando.find((f) => f.id === cine)?.pendiente).toBe('20.00');
  });
});

describe('ajuste por saldo real', () => {
  it('calcular_ajuste: diferencia positiva y sentido; 0 si cuadra', async () => {
    // BBVA hoy: 1000 + 1258 − 30 + 10 − 100 − 5 + 20 − 12 − 8 = 2133,00
    expect(await valorCuenta(db, bbva, await hoy())).toBe('2133.00');
    const sube = await comoUsuario(`select saldo_app::text, saldo_real::text, diferencia::text, sentido from calcular_ajuste($1, '2.145,40')`, [bbva]);
    expect(sube).toEqual([{ saldo_app: '2133.00', saldo_real: '2145.40', diferencia: '12.40', sentido: 'suma' }]);
    const baja = await comoUsuario(`select diferencia::text, sentido from calcular_ajuste($1, '2133')`, [bbva]);
    expect(baja).toEqual([{ diferencia: '0.00', sentido: null }]);
    const descubierto = await comoUsuario(`select diferencia::text, sentido from calcular_ajuste($1, '-20,00')`, [bbva]);
    expect(descubierto).toEqual([{ diferencia: '2153.00', sentido: 'resta' }]);
  });

  it('crear_ajuste crea el ajuste con la diferencia de la base y la nota; no cuenta en el balance', async () => {
    const [r] = await comoUsuario<{ id: string; diferencia: string; sentido: string }>(
      `select id, diferencia::text, sentido from crear_ajuste($1, '2.120,00', 'Diferencia con el extracto', 'Ajuste de saldo')`, [bbva],
    );
    expect(r).toMatchObject({ diferencia: '13.00', sentido: 'resta' });
    const fila = await una(db, `select tipo, importe::text, sentido, notas, concepto, user_id from movimientos where id = $1`, [r?.id]);
    expect(fila).toEqual({ tipo: 'ajuste', importe: '13.00', sentido: 'resta', notas: 'Diferencia con el extracto', concepto: 'Ajuste de saldo', user_id: u });
    expect(await valorCuenta(db, bbva, await hoy())).toBe('2120.00');
    const balance = await comoUsuario<{ b: string }>(`select balance::text as b from resumen_periodo('2026-10-01', '2026-10-31')`);
    expect(balance[0]?.b).toBe('1237.70');
  });

  it('sin diferencia no crea nada; sin nota, saldo raro o cuenta ajena, error con código', async () => {
    expect(await comoUsuario(`select id, diferencia::text from crear_ajuste($1, '2133,00', 'Cuadra')`, [bbva]))
      .toEqual([{ id: null, diferencia: '0.00' }]);
    await expect(comoUsuario(`select * from crear_ajuste($1, '10', '  ')`, [bbva])).rejects.toThrow('nota_obligatoria');
    await expect(comoUsuario(`select * from calcular_ajuste($1, '12abc')`, [bbva])).rejects.toThrow('saldo_no_valido');
    const otro = await crearUsuario(db);
    const ajena = await crearCuenta(db, otro, { nombre: 'Ajena' });
    await expect(comoUsuario(`select * from crear_ajuste($1, '10', 'x')`, [ajena])).rejects.toThrow('cuenta_no_valida');
    expect((await una<{ n: number }>(db, `select count(*)::int as n from movimientos where cuenta_id = $1`, [ajena])).n).toBe(0);
  });

  it('una cuenta de inversión no se cuadra con un ajuste (su valor real es una valoración)', async () => {
    const broker = await crearCuenta(db, u, { nombre: 'Broker', tipo: 'inversion', saldoInicial: '500.00' });
    await expect(comoUsuario(`select * from calcular_ajuste($1, '510')`, [broker])).rejects.toThrow('cuenta_inversion');
    await expect(comoUsuario(`select * from crear_ajuste($1, '510', 'x')`, [broker])).rejects.toThrow('cuenta_inversion');
  });
});

describe('media_gasto_categoria', () => {
  it('gasto neto medio de los meses completos (sin el mes en curso ni meses antes de los datos)', async () => {
    const hoyDb = await hoy();
    const mes = hoyDb.slice(0, 7);
    // Cuentas nuevas que empiezan el día 1 hace 4 meses: 3 meses completos.
    const v = await crearUsuario(db);
    const inicio = (await una<{ d: string }>(db, `select (date_trunc('month', $1::date) - interval '4 months')::date::text as d`, [hoyDb])).d;
    const cuenta = await crearCuenta(db, v, { nombre: 'Banco', saldoInicial: '0', fechaInicial: inicio });
    const cat = await crearCategoria(db, v, 'Ocio', 'gasto');
    const mesAnt = (n: number) => una<{ d: string }>(db, `select (date_trunc('month', $1::date) - make_interval(months => $2))::date::text as d`, [hoyDb, n]);
    await mov(db, v, { tipo: 'gasto', importe: '300.00', fecha: (await mesAnt(1)).d, cuenta, categoria: cat });
    await mov(db, v, { tipo: 'gasto', importe: '600.00', fecha: (await mesAnt(2)).d, cuenta, categoria: cat });
    await mov(db, v, { tipo: 'devolucion', importe: '60.00', fecha: (await mesAnt(3)).d, cuenta, categoria: cat });
    await mov(db, v, { tipo: 'gasto', importe: '1000.00', fecha: (await mesAnt(4)).d, cuenta, categoria: cat }); // fuera
    await mov(db, v, { tipo: 'gasto', importe: '999.00', fecha: `${mes}-01`, cuenta, categoria: cat }); // mes en curso
    await actuarComo(db, v);
    const r = await conRol(db, 'authenticated', async () =>
      todas(db, `select round(media, 2)::text as media, meses from media_gasto_categoria($1)`, [cat]));
    // (300 + 600 − 60) / 3 meses completos
    expect(r).toEqual([{ media: '280.00', meses: 3 }]);
  });

  it('sin meses completos de datos: media NULL', async () => {
    const v = await crearUsuario(db);
    const hoyDb = await hoy();
    await crearCuenta(db, v, { nombre: 'Banco', fechaInicial: hoyDb });
    const cat = await crearCategoria(db, v, 'Ocio', 'gasto');
    await actuarComo(db, v);
    const r = await conRol(db, 'authenticated', async () => todas(db, `select media, meses from media_gasto_categoria($1)`, [cat]));
    expect(r).toEqual([{ media: null, meses: 0 }]);
  });
});

describe('crear_banco con fecha de partida', () => {
  it('sin fecha, hoy; con fecha pasada, esa; futura, error', async () => {
    const hoyDb = await hoy();
    const [a] = await comoUsuario<{ id: string }>(`select crear_banco('ing', null, null, '10,00') as id`);
    const [b] = await comoUsuario<{ id: string }>(`select crear_banco(null, 'Caja Rural', '#15803d', '5', '2026-01-15') as id`);
    expect((await una(db, `select fecha_inicial::text as f from cuentas where id = $1`, [a?.id])).f).toBe(hoyDb);
    expect((await una(db, `select fecha_inicial::text as f, saldo_inicial::text as s from cuentas where id = $1`, [b?.id])))
      .toEqual({ f: '2026-01-15', s: '5.00' });
    await expect(comoUsuario(`select crear_banco('bbva', null, null, '1', current_date + 400)`)).rejects.toThrow('fecha_futura');
  });
});

describe('seguridad y rollback', () => {
  it('anon no ejecuta ninguna función nueva', async () => {
    await expect(conRol(db, 'anon', () => db.query(`select * from resumen_filtro()`))).rejects.toThrow(/permission denied/);
    await expect(conRol(db, 'anon', () => db.query(`select * from crear_ajuste(gen_random_uuid(), '1', 'x')`))).rejects.toThrow(/permission denied/);
  });

  it('el down borra las funciones nuevas y restaura crear_banco de 4 argumentos', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec(ROLLBACK_MOVIMIENTOS_UX);
      const restos = await todas<{ fn: string; n: number }>(
        limpia,
        `select proname as fn, pronargs::int as n from pg_proc where pronamespace = 'public'::regnamespace
           and proname in ('movimientos_filtrados', 'totales_por_tipo', 'subtotales_por_dia', 'resumen_filtro',
                           'normalizar_concepto', 'sugerir_categoria', 'categorias_mas_usadas', 'gastos_devolvibles',
                           'calcular_ajuste', 'crear_ajuste', 'media_gasto_categoria', 'crear_banco')`,
      );
      expect(restos).toEqual([{ fn: 'crear_banco', n: 4 }]);
      await limpia.exec(MIGRACION_MOVIMIENTOS_UX);
    } finally {
      await limpia.close();
    }
  });
});
