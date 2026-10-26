/**
 * Migración 20261024000000_categorias_y_cuentas_clave.sql: categorías nuevas por defecto
 * (backfill sin duplicar y onboarding), clave de la cuenta de efectivo (backfill, onboarding,
 * renombrar), concepto por defecto del atajo en el idioma del usuario, permisos y rollback.
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CATEGORIAS_POR_DEFECTO, MIGRACIONES, MIGRACION_CATEGORIAS_CUENTAS_CLAVE, ROLLBACK_CATEGORIAS_CUENTAS_CLAVE,
  actuarComo, conRol, crearCuenta, crearDb, crearUsuario, todas, una,
} from './helpers.js';

let db: PGlite;
let u: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { u = await crearUsuario(db); });

/** Base con todas las migraciones anteriores a esta. */
const ANTERIORES = MIGRACIONES.indexOf(MIGRACION_CATEGORIAS_CUENTAS_CLAVE);

const categorias = (base: PGlite, id: string) =>
  todas<{ nombre: string; clave: string | null; orden: number }>(
    base, `select nombre, clave, orden from categorias where user_id = $1 order by orden, nombre`, [id],
  );

const cuentas = (base: PGlite, id: string) =>
  todas<{ nombre: string; clave: string | null }>(
    base, `select nombre, clave from cuentas where user_id = $1 order by orden, nombre`, [id],
  );

async function prepararUsuario(base: PGlite): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  await base.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@test.local`]);
  const { token } = await una<{ token: string }>(base, `select preparar_usuario($1) as token`, [`${id}@test.local`]);
  return { id, token };
}

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

describe('backfill de categorías', () => {
  it('añade las nuevas antes de «Otros gastos», sin duplicar las que ya existen por nombre', async () => {
    const vieja = await crearDb({ hasta: ANTERIORES });
    try {
      const { id } = await prepararUsuario(vieja);
      // Ya tiene una «ropa» propia (otra grafía) y un «Regalos» de ingreso: no se duplican ni cambian.
      await vieja.query(`insert into categorias (user_id, nombre, tipo, orden) values ($1, ' ropa ', 'gasto', 20)`, [id]);
      await vieja.query(`insert into categorias (user_id, nombre, tipo, orden) values ($1, 'Regalos', 'ingreso', 21)`, [id]);
      const sinCategorias = randomUUID();
      await vieja.query(`insert into auth.users (id, email) values ($1, $2)`, [sinCategorias, `${sinCategorias}@test.local`]);

      await vieja.exec(MIGRACION_CATEGORIAS_CUENTAS_CLAVE);

      expect(await categorias(vieja, id)).toEqual([
        { nombre: 'Restaurantes', clave: 'restaurantes', orden: 1 },
        { nombre: 'Ocio', clave: 'ocio', orden: 2 },
        { nombre: 'Transporte', clave: 'transporte', orden: 3 },
        { nombre: 'Suscripciones', clave: 'suscripciones', orden: 4 },
        { nombre: 'Supermercado', clave: 'supermercado', orden: 5 },
        { nombre: 'Hogar', clave: 'hogar', orden: 6 },
        { nombre: 'Salud', clave: 'salud', orden: 7 },
        { nombre: 'Deporte', clave: 'deporte', orden: 8 },
        { nombre: 'Cuidado personal', clave: 'cuidado_personal', orden: 9 },
        { nombre: 'Otros gastos', clave: 'otros_gastos', orden: 10 },
        { nombre: 'Nómina', clave: 'nomina', orden: 11 },
        { nombre: 'Otros ingresos', clave: 'otros_ingresos', orden: 12 },
        { nombre: 'Rendimientos', clave: 'rendimientos', orden: 13 },
        { nombre: ' ropa ', clave: null, orden: 25 },
        { nombre: 'Regalos', clave: null, orden: 26 },
      ]);
      // Quien aún no ha hecho el onboarding no recibe nada: las tendrá al hacerlo.
      expect(await categorias(vieja, sinCategorias)).toEqual([]);
    } finally {
      await vieja.close();
    }
  });

  it('sin «Otros gastos» (renombrada), las nuevas van al final; los movimientos no cambian de categoría', async () => {
    const vieja = await crearDb({ hasta: ANTERIORES });
    try {
      const { id } = await prepararUsuario(vieja);
      await vieja.query(`update categorias set nombre = 'Varios' where user_id = $1 and nombre = 'Otros gastos'`, [id]);
      const varios = await una<{ id: string }>(vieja, `select id from categorias where user_id = $1 and nombre = 'Varios'`, [id]);
      const cuenta = await una<{ id: string }>(vieja, `select id from cuentas where user_id = $1 and nombre = 'BBVA'`, [id]);
      await vieja.query(
        `insert into movimientos (user_id, tipo, importe, fecha, cuenta_id, categoria_id, concepto)
         values ($1, 'gasto', '12.00', current_date, $2, $3, 'Pádel')`,
        [id, cuenta.id, varios.id],
      );

      await vieja.exec(MIGRACION_CATEGORIAS_CUENTAS_CLAVE);

      const filas = await categorias(vieja, id);
      expect(filas.slice(-7).map((f) => [f.nombre, f.orden])).toEqual([
        ['Supermercado', 9], ['Hogar', 10], ['Salud', 11], ['Deporte', 12], ['Cuidado personal', 13], ['Ropa', 14], ['Regalos', 15],
      ]);
      expect(await una(vieja, `select categoria_id from movimientos where user_id = $1`, [id])).toEqual({ categoria_id: varios.id });
    } finally {
      await vieja.close();
    }
  });
});

describe('backfill de la cuenta de efectivo', () => {
  it('pone la clave solo a la cuenta de efectivo que conserva el nombre «Efectivo»', async () => {
    const vieja = await crearDb({ hasta: ANTERIORES });
    try {
      const { id } = await prepararUsuario(vieja);
      const otro = randomUUID();
      await vieja.query(`insert into auth.users (id, email) values ($1, $2)`, [otro, `${otro}@test.local`]);
      await crearCuenta(vieja, otro, { nombre: 'Cartera', tipo: 'efectivo' });
      await crearCuenta(vieja, otro, { nombre: 'Efectivo', tipo: 'banco' });

      await vieja.exec(MIGRACION_CATEGORIAS_CUENTAS_CLAVE);

      expect(await cuentas(vieja, id)).toEqual([
        { nombre: 'BBVA', clave: null },
        { nombre: 'Efectivo', clave: 'efectivo' },
        { nombre: 'Trade Republic', clave: null },
      ]);
      expect((await cuentas(vieja, otro)).map((c) => c.clave)).toEqual([null, null]);
    } finally {
      await vieja.close();
    }
  });
});

describe('usuarios nuevos', () => {
  it('completar_onboarding crea las 15 categorías por defecto y el efectivo con clave', async () => {
    await comoUsuario(`select completar_onboarding('ca', $1::jsonb, '0')`,
      [JSON.stringify([{ entidad: 'bbva', nombre: '', color: null, saldo: '10' }])]);
    expect((await categorias(db, u)).map(({ nombre, clave }) => ({ nombre, clave }))).toEqual(CATEGORIAS_POR_DEFECTO);
    expect(CATEGORIAS_POR_DEFECTO).toHaveLength(15);
    expect(await cuentas(db, u)).toEqual([{ nombre: 'BBVA', clave: null }, { nombre: 'Efectivo', clave: 'efectivo' }]);
  });

  it('preparar_usuario también, con las mismas categorías (orden, color e icono)', async () => {
    const { id } = await prepararUsuario(db);
    await comoUsuario(`select completar_onboarding('es', $1::jsonb, '0')`,
      [JSON.stringify([{ entidad: 'bbva', nombre: '', color: null, saldo: '10' }])]);
    const detalle = (uid: string) => todas(
      db, `select nombre, clave, tipo::text, color, icono, orden from categorias where user_id = $1 order by orden`, [uid],
    );
    expect(await detalle(id)).toEqual(await detalle(u));
    expect((await cuentas(db, id)).find((c) => c.nombre === 'Efectivo')).toEqual({ nombre: 'Efectivo', clave: 'efectivo' });
  });
});

describe('renombrar la cuenta de efectivo', () => {
  let efectivo: string;
  beforeEach(async () => {
    efectivo = (await una<{ id: string }>(
      db,
      `insert into cuentas (user_id, nombre, clave, tipo) values ($1, 'Efectivo', 'efectivo', 'efectivo') returning id`,
      [u],
    )).id;
  });
  const claveDe = async (id: string) =>
    (await una<{ clave: string | null }>(db, `select clave from cuentas where id = $1`, [id])).clave;

  it('cambiar el nombre quita la clave (manda el nombre del usuario)', async () => {
    await comoUsuario(`update cuentas set nombre = 'Cartera' where id = $1`, [efectivo]);
    expect(await claveDe(efectivo)).toBeNull();
  });

  it('cambiar otros campos, o guardar el mismo nombre, conserva la clave', async () => {
    await comoUsuario(`update cuentas set emoji = '👛', orden = 7, nombre = 'Efectivo' where id = $1`, [efectivo]);
    expect(await claveDe(efectivo)).toBe('efectivo');
  });

  it('el cliente puede quitar la clave, pero nunca asignarla', async () => {
    const cartera = await crearCuenta(db, u, { nombre: 'Cartera', tipo: 'efectivo' });
    await expect(comoUsuario(`update cuentas set clave = 'efectivo' where id = $1`, [cartera]))
      .rejects.toMatchObject({ code: '23514' });
    await comoUsuario(`update cuentas set clave = null where id = $1`, [efectivo]);
    expect(await claveDe(efectivo)).toBeNull();
  });

  it('solo una cuenta de efectivo puede llevar la clave, y una por usuario', async () => {
    await expect(db.query(`insert into cuentas (user_id, nombre, clave, tipo) values ($1, 'X', 'efectivo', 'banco')`, [u]))
      .rejects.toThrow(/cuentas_clave_tipo/);
    await expect(db.query(`insert into cuentas (user_id, nombre, clave, tipo) values ($1, 'X', 'otra', 'efectivo')`, [u]))
      .rejects.toThrow(/cuentas_clave_valida/);
    await expect(db.query(`insert into cuentas (user_id, nombre, clave, tipo) values ($1, 'X', 'efectivo', 'efectivo')`, [u]))
      .rejects.toThrow(/cuentas_una_por_clave/);
  });
});

describe('concepto por defecto del atajo', () => {
  async function atajoSinConcepto(token: string, tipo: string): Promise<string> {
    const r = await conRol(db, 'anon', async () => (await una<{ r: { ok: boolean; id: string } }>(
      db, `select registrar_movimiento(token => $1, tipo => $2, importe => '5', categoria => $3) as r`,
      [token, tipo, tipo === 'ingreso' ? 'Nómina' : 'Ocio'],
    )).r);
    expect(r.ok).toBe(true);
    return (await una<{ concepto: string }>(db, `select concepto from movimientos where id = $1`, [r.id])).concepto;
  }

  it('sin concepto ni comercio, el concepto es el tipo en el idioma del perfil', async () => {
    const { id, token } = await prepararUsuario(db);
    await actuarComo(db, null);
    expect(await atajoSinConcepto(token, 'gasto')).toBe('Gasto');
    expect(await atajoSinConcepto(token, 'devolucion')).toBe('Devolución');
    await db.query(`update perfiles set idioma = 'en' where user_id = $1`, [id]);
    expect(await atajoSinConcepto(token, 'gasto')).toBe('Expense');
    expect(await atajoSinConcepto(token, 'ingreso')).toBe('Income');
    await db.query(`update perfiles set idioma = 'ca' where user_id = $1`, [id]);
    expect(await atajoSinConcepto(token, 'gasto')).toBe('Despesa');
    expect(await atajoSinConcepto(token, 'devolucion')).toBe('Devolució');
  });

  it('el concepto o el comercio que envía el usuario no se tocan', async () => {
    const { id, token } = await prepararUsuario(db);
    await db.query(`update perfiles set idioma = 'en' where user_id = $1`, [id]);
    await actuarComo(db, null);
    const r = await conRol(db, 'anon', async () => (await una<{ r: { id: string } }>(
      db,
      `select registrar_movimiento(token => $1, tipo => 'gasto', importe => '5', categoria => 'Ocio', concepto => 'Gasto') as r`,
      [token],
    )).r);
    expect(await una(db, `select concepto from movimientos where id = $1`, [r.id])).toEqual({ concepto: 'Gasto' });
  });
});

describe('permisos', () => {
  it('las funciones nuevas no las puede ejecutar nadie directamente', async () => {
    for (const fn of ['limpiar_clave_cuenta()', 'concepto_por_defecto(tipo_movimiento, text)']) {
      for (const rol of ['anon', 'authenticated']) {
        const { p } = await una<{ p: boolean }>(db, `select has_function_privilege($1, $2, 'execute') as p`, [rol, fn]);
        expect(p, `${rol} ${fn}`).toBe(false);
      }
      const { p } = await una<{ p: boolean }>(
        db,
        `select coalesce(bool_or(acl.privilege_type = 'EXECUTE' and acl.grantee = 0), false) as p
           from pg_proc, aclexplode(coalesce(proacl, acldefault('f', proowner))) acl
          where oid = $1::regprocedure`,
        [fn],
      );
      expect(p, `public ${fn}`).toBe(false);
    }
  });

  it('un usuario no ve ni cambia la clave de las cuentas de otro', async () => {
    const otro = await crearUsuario(db);
    const ajena = (await una<{ id: string }>(
      db, `insert into cuentas (user_id, nombre, clave, tipo) values ($1, 'Efectivo', 'efectivo', 'efectivo') returning id`, [otro],
    )).id;
    expect(await comoUsuario(`select clave from cuentas where id = $1`, [ajena])).toEqual([]);
    await comoUsuario(`update cuentas set clave = null where id = $1`, [ajena]);
    expect(await una(db, `select clave from cuentas where id = $1`, [ajena])).toEqual({ clave: 'efectivo' });
  });
});

describe('rollback', () => {
  it('quita la clave de cuentas y las funciones, conserva las categorías nuevas sin clave y se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      const { id, token } = await prepararUsuario(limpia);
      await limpia.exec(ROLLBACK_CATEGORIAS_CUENTAS_CLAVE);

      expect(await todas(
        limpia,
        `select column_name as n from information_schema.columns where table_name = 'cuentas' and column_name = 'clave'
         union all select proname from pg_proc where proname in ('limpiar_clave_cuenta', 'concepto_por_defecto')
         union all select tgname from pg_trigger where tgname = 'cuentas_limpiar_clave'`,
      )).toEqual([]);
      const tras = await categorias(limpia, id);
      expect(tras).toHaveLength(15);
      expect(tras.find((c) => c.nombre === 'Ropa')?.clave).toBeNull();
      expect(tras.find((c) => c.nombre === 'Ocio')?.clave).toBe('ocio');
      await expect(limpia.query(`insert into categorias (user_id, nombre, clave, tipo) values ($1, 'X', 'ropa', 'gasto')`, [id]))
        .rejects.toThrow(/categorias_clave_valida/);

      // Funciones de antes: 8 categorías por defecto y concepto initcap(tipo).
      const { id: nuevo } = await prepararUsuario(limpia);
      expect(await categorias(limpia, nuevo)).toHaveLength(8);
      const r = await conRol(limpia, 'anon', async () => (await una<{ r: { id: string } }>(
        limpia, `select registrar_movimiento(token => $1, tipo => 'gasto', importe => '5', categoria => 'Ocio') as r`, [token],
      )).r);
      expect(await una(limpia, `select concepto from movimientos where id = $1`, [r.id])).toEqual({ concepto: 'Gasto' });

      await limpia.exec(MIGRACION_CATEGORIAS_CUENTAS_CLAVE);
      // Sin duplicados: el primero ya tenía las 15 (por nombre); el segundo recibe las 7 nuevas.
      expect(await categorias(limpia, id)).toHaveLength(15);
      expect((await categorias(limpia, nuevo)).map(({ nombre, clave }) => ({ nombre, clave }))).toEqual(CATEGORIAS_POR_DEFECTO);
      expect((await cuentas(limpia, id)).find((c) => c.nombre === 'Efectivo')?.clave).toBe('efectivo');
    } finally {
      await limpia.close();
    }
  });
});
