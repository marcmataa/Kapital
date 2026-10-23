/**
 * Migración 20261023000001_categorias_clave.sql: clave de las categorías por
 * defecto para mostrarlas traducidas (backfill, onboarding, renombrar, RLS y
 * rollback).
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_CATEGORIAS_CLAVE, ROLLBACK_CATEGORIAS_CLAVE, actuarComo, conRol, crearCategoria, crearDb, crearUsuario,
  todas, una,
} from './helpers.js';

let db: PGlite;
let u: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { u = await crearUsuario(db); });

const POR_DEFECTO = [
  { nombre: 'Restaurantes', clave: 'restaurantes' },
  { nombre: 'Ocio', clave: 'ocio' },
  { nombre: 'Transporte', clave: 'transporte' },
  { nombre: 'Suscripciones', clave: 'suscripciones' },
  { nombre: 'Otros gastos', clave: 'otros_gastos' },
  { nombre: 'Nómina', clave: 'nomina' },
  { nombre: 'Otros ingresos', clave: 'otros_ingresos' },
  { nombre: 'Rendimientos', clave: 'rendimientos' },
];

const claves = (base: PGlite, id: string) =>
  todas<{ nombre: string; clave: string | null }>(
    base, `select nombre, clave from categorias where user_id = $1 order by orden, nombre`, [id],
  );

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

async function prepararUsuario(base: PGlite): Promise<string> {
  const id = randomUUID();
  await base.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@test.local`]);
  await base.query(`select preparar_usuario($1)`, [`${id}@test.local`]);
  return id;
}

describe('backfill', () => {
  it('pone la clave a las categorías por defecto que conservan nombre y tipo, y no a las demás', async () => {
    const vieja = await crearDb({ hasta: 3 });
    try {
      const id = await prepararUsuario(vieja);
      await vieja.query(`update categorias set nombre = 'Fiesta' where user_id = $1 and nombre = 'Ocio'`, [id]);
      await vieja.query(`insert into categorias (user_id, nombre, tipo, orden) values ($1, 'Viajes', 'gasto', 20)`, [id]);
      // Mismo nombre que una por defecto pero otro tipo: no es la por defecto.
      await vieja.query(`insert into categorias (user_id, nombre, tipo, orden) values ($1, 'Ocio', 'ingreso', 21)`, [id]);

      await vieja.exec(MIGRACION_CATEGORIAS_CLAVE);

      expect(await claves(vieja, id)).toEqual([
        { nombre: 'Restaurantes', clave: 'restaurantes' },
        { nombre: 'Fiesta', clave: null },
        { nombre: 'Transporte', clave: 'transporte' },
        { nombre: 'Suscripciones', clave: 'suscripciones' },
        { nombre: 'Otros gastos', clave: 'otros_gastos' },
        { nombre: 'Nómina', clave: 'nomina' },
        { nombre: 'Otros ingresos', clave: 'otros_ingresos' },
        { nombre: 'Rendimientos', clave: 'rendimientos' },
        { nombre: 'Viajes', clave: null },
        { nombre: 'Ocio', clave: null },
      ]);
    } finally {
      await vieja.close();
    }
  });
});

describe('usuarios nuevos', () => {
  it('completar_onboarding crea las categorías por defecto con su clave', async () => {
    await comoUsuario(`select completar_onboarding('en', $1::jsonb, '0')`,
      [JSON.stringify([{ entidad: 'bbva', nombre: '', color: null, saldo: '10' }])]);
    expect(await claves(db, u)).toEqual(POR_DEFECTO);
  });

  it('preparar_usuario también', async () => {
    expect(await claves(db, await prepararUsuario(db))).toEqual(POR_DEFECTO);
  });

  it('una categoría creada por el usuario no tiene clave, aunque se llame como una por defecto', async () => {
    const [fila] = await comoUsuario<{ clave: string | null }>(
      `insert into categorias (nombre, tipo) values ('Ocio', 'gasto') returning clave`,
    );
    expect(fila).toEqual({ clave: null });
  });
});

describe('renombrar', () => {
  let ocio: string;
  beforeEach(async () => {
    ocio = (await una<{ id: string }>(
      db, `insert into categorias (user_id, nombre, clave, tipo) values ($1, 'Ocio', 'ocio', 'gasto') returning id`, [u],
    )).id;
  });
  const claveDe = async (id: string) =>
    (await una<{ clave: string | null }>(db, `select clave from categorias where id = $1`, [id])).clave;

  it('cambiar el nombre pone la clave a null (manda el nombre del usuario)', async () => {
    await comoUsuario(`update categorias set nombre = 'Leisure' where id = $1`, [ocio]);
    expect(await claveDe(ocio)).toBeNull();
  });

  it('cambiar otros campos, o guardar el mismo nombre, conserva la clave', async () => {
    await comoUsuario(`update categorias set color = '#3b82ff', orden = 9, nombre = 'Ocio' where id = $1`, [ocio]);
    expect(await claveDe(ocio)).toBe('ocio');
  });

  it('el cliente puede quitar la clave, pero nunca asignarla', async () => {
    const viajes = await crearCategoria(db, u, 'Viajes', 'gasto');
    await expect(comoUsuario(`update categorias set clave = 'transporte' where id = $1`, [viajes]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(comoUsuario(`update categorias set clave = 'transporte' where id = $1`, [ocio]))
      .rejects.toMatchObject({ code: '23514' });
    await comoUsuario(`update categorias set clave = null where id = $1`, [ocio]);
    expect(await claveDe(ocio)).toBeNull();
  });

  it('Rendimientos sigue sin poder renombrarse', async () => {
    const id = (await una<{ id: string }>(
      db,
      `insert into categorias (user_id, nombre, clave, tipo) values ($1, 'Rendimientos', 'rendimientos', 'ingreso') returning id`,
      [u],
    )).id;
    await expect(comoUsuario(`update categorias set nombre = 'Returns' where id = $1`, [id]))
      .rejects.toMatchObject({ code: '23514' });
    expect(await claveDe(id)).toBe('rendimientos');
  });
});

describe('restricciones', () => {
  it('solo admite las claves conocidas y una de cada por usuario', async () => {
    await expect(db.query(`insert into categorias (user_id, nombre, clave, tipo) values ($1, 'X', 'inventada', 'gasto')`, [u]))
      .rejects.toThrow(/categorias_clave_valida/);
    await db.query(`insert into categorias (user_id, nombre, clave, tipo) values ($1, 'Ocio', 'ocio', 'gasto')`, [u]);
    await expect(db.query(`insert into categorias (user_id, nombre, clave, tipo) values ($1, 'Ocio 2', 'ocio', 'gasto')`, [u]))
      .rejects.toThrow(/categorias_una_por_clave/);
    // Otro usuario sí puede tener la suya.
    const otro = await crearUsuario(db);
    await db.query(`insert into categorias (user_id, nombre, clave, tipo) values ($1, 'Ocio', 'ocio', 'gasto')`, [otro]);
  });
});

describe('RLS y permisos', () => {
  it('un usuario no ve ni cambia la clave de las categorías de otro', async () => {
    const otro = await crearUsuario(db);
    const ajena = (await una<{ id: string }>(
      db, `insert into categorias (user_id, nombre, clave, tipo) values ($1, 'Ocio', 'ocio', 'gasto') returning id`, [otro],
    )).id;
    expect(await comoUsuario(`select id, clave from categorias where id = $1`, [ajena])).toEqual([]);
    await comoUsuario(`update categorias set clave = null, nombre = 'Hackeada' where id = $1`, [ajena]);
    expect(await una(db, `select nombre, clave from categorias where id = $1`, [ajena]))
      .toEqual({ nombre: 'Ocio', clave: 'ocio' });
    await actuarComo(db, u);
    await expect(conRol(db, 'anon', () => db.query(`select clave from categorias`))).rejects.toThrow(/permission denied/);
  });

  it('la función del trigger no la puede ejecutar nadie directamente', async () => {
    for (const rol of ['public', 'anon', 'authenticated']) {
      const { p } = await una<{ p: boolean }>(
        db,
        rol === 'public'
          ? `select bool_or(acl.privilege_type = 'EXECUTE' and acl.grantee = 0) as p
               from pg_proc, aclexplode(coalesce(proacl, acldefault('f', proowner))) acl
              where proname = 'limpiar_clave_categoria'`
          : `select has_function_privilege($1, 'limpiar_clave_categoria()', 'execute') as p`,
        rol === 'public' ? [] : [rol],
      );
      expect(p, rol).toBe(false);
    }
  });
});

describe('rollback', () => {
  it('quita la columna, el trigger y la función; el onboarding sigue funcionando y se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec(ROLLBACK_CATEGORIAS_CLAVE);
      expect(await todas(
        limpia,
        `select column_name as n from information_schema.columns where table_name = 'categorias' and column_name = 'clave'
         union all select proname from pg_proc where proname = 'limpiar_clave_categoria'
         union all select tgname from pg_trigger where tgname = 'categorias_limpiar_clave'`,
      )).toEqual([]);
      const id = await prepararUsuario(limpia);
      expect((await una(limpia, `select count(*)::int as n from categorias where user_id = $1`, [id])).n).toBe(8);

      await limpia.exec(MIGRACION_CATEGORIAS_CLAVE);
      expect(await claves(limpia, id)).toEqual(POR_DEFECTO);
    } finally {
      await limpia.close();
    }
  });
});
