/**
 * Aislamiento entre usuarios (RLS + claves compuestas), permisos de Supabase
 * y rollback de la migración.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION, ROLLBACK, actuarComo, conRol, crearCategoria, crearCuenta, crearDb, crearUsuario, mov, todas, una,
} from './helpers.js';

let db: PGlite;
let a: string;
let b: string;
let cuentaA: string;
let cuentaB: string;
let ocioB: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  b = await crearUsuario(db);
  cuentaB = await crearCuenta(db, b, { nombre: 'BBVA', saldoInicial: '5000.00' });
  ocioB = await crearCategoria(db, b, 'Ocio', 'gasto');
  a = await crearUsuario(db);
  cuentaA = await crearCuenta(db, a, { nombre: 'BBVA', saldoInicial: '100.00' });
});

describe('aislamiento entre usuarios', () => {
  it('con sesión, cada usuario solo ve sus filas y su patrimonio', async () => {
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      const cuentas = await todas(db, `select id from cuentas`);
      expect(cuentas).toEqual([{ id: cuentaA }]);
      expect((await una(db, `select patrimonio('2026-10-01')::text as p`)).p).toBe('100.00');
      expect(await todas(db, `select id from v_saldos`)).toEqual([{ id: cuentaA }]);
    });
  });

  it('no se pueden crear ni modificar filas de otro usuario', async () => {
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      await expect(db.query(`insert into cuentas (user_id, nombre) values ($1, 'Intrusa')`, [b]))
        .rejects.toThrow(/row-level security/);
      const { affectedRows } = await db.query(`update cuentas set nombre = 'Hackeada' where id = $1`, [cuentaB]);
      expect(affectedRows).toBe(0);
    });
    expect((await una(db, `select nombre from cuentas where id = $1`, [cuentaB])).nombre).toBe('BBVA');
  });

  it('un movimiento no puede apuntar a la cuenta o la categoría de otro usuario (aunque se salte RLS)', async () => {
    await expect(mov(db, a, { tipo: 'traspaso', importe: '1', fecha: '2026-10-01', cuenta: cuentaA, destino: cuentaB }))
      .rejects.toThrow(/foreign key/);
    const ocioA = await crearCategoria(db, a, 'Ocio', 'gasto');
    await expect(mov(db, a, { tipo: 'gasto', importe: '1', fecha: '2026-10-01', cuenta: cuentaA, categoria: ocioB }))
      .rejects.toThrow(/foreign key/);
    await expect(mov(db, a, { tipo: 'gasto', importe: '1', fecha: '2026-10-01', cuenta: cuentaB, categoria: ocioA }))
      .rejects.toThrow(/foreign key/);
  });

  it('desde la app (authenticated) el usuario crea sus datos sin indicar user_id', async () => {
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      const { id } = await una<{ id: string }>(db, `insert into categorias (nombre, tipo) values ('Viajes', 'gasto') returning id`);
      await db.query(
        `insert into movimientos (tipo, importe, fecha, cuenta_id, categoria_id, concepto)
         values ('gasto', 10, '2026-10-01', $1, $2, 'Tren')`,
        [cuentaA, id],
      );
      expect((await una(db, `select patrimonio('2026-10-01')::text as p`)).p).toBe('90.00');
    });
  });
});

describe('borrado de un usuario', () => {
  it('borra en cascada todos sus datos, incluidas cuentas cerradas, sin tocar los de otros', async () => {
    const efectivo = await crearCuenta(db, a, { nombre: 'Efectivo', tipo: 'efectivo' });
    const ocioA = await crearCategoria(db, a, 'Ocio', 'gasto');
    await mov(db, a, { tipo: 'traspaso', importe: '10', fecha: '2026-10-01', cuenta: cuentaA, destino: efectivo });
    await mov(db, a, { tipo: 'gasto', importe: '10', fecha: '2026-10-02', cuenta: efectivo, categoria: ocioA });
    await db.query(`update cuentas set fecha_cierre = '2026-10-02' where id = $1`, [efectivo]);

    await db.query(`delete from auth.users where id = $1`, [a]);
    expect(await todas(db, `select 1 from movimientos where user_id = $1`, [a])).toEqual([]);
    expect(await todas(db, `select 1 from cuentas where user_id = $1`, [a])).toEqual([]);
    expect(await todas(db, `select 1 from cuentas where user_id = $1`, [b])).toHaveLength(1);
  });
});

describe('permisos', () => {
  it('el usuario puede crear y revocar tokens, pero no cambiar su hash ni preparar usuarios', async () => {
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      const { token } = await una<{ token: string }>(db, `select crear_token('iPad') as token`);
      expect(token).toMatch(/^mf_[0-9a-f]{64}$/);
      const { hash } = await una<{ hash: string }>(db, `select token_hash as hash from tokens_api where nombre = 'iPad'`);
      expect(hash).not.toContain(token.slice(3));

      await db.query(`update tokens_api set revocado = true where nombre = 'iPad'`);
      await expect(db.query(`update tokens_api set token_hash = 'x' where nombre = 'iPad'`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select preparar_usuario('x@y.z')`)).rejects.toThrow(/permission denied/);
    });
  });

  it('ninguna función queda ejecutable por anon salvo registrar_movimiento', async () => {
    const filas = await todas<{ fn: string }>(
      db,
      `select p.proname as fn from pg_proc p
       where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(filas.map((f) => f.fn)).toEqual(['registrar_movimiento']);
  });

  it('las funciones security definer fijan search_path', async () => {
    const filas = await todas<{ fn: string; config: string[] | null }>(
      db,
      `select proname as fn, proconfig as config from pg_proc
       where pronamespace = 'public'::regnamespace and prosecdef`,
    );
    expect(filas.map((f) => f.fn).sort()).toEqual(['preparar_usuario', 'registrar_movimiento']);
    for (const f of filas) expect(f.config, f.fn).toContain('search_path=public');
  });
});

describe('rollback', () => {
  it('el script down deja el schema public vacío y la migración se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec(ROLLBACK);
      const restos = await todas(
        limpia,
        `select 'clase' as k, relname as n from pg_class where relnamespace = 'public'::regnamespace
         union all select 'funcion', proname from pg_proc where pronamespace = 'public'::regnamespace
         union all select 'tipo', typname from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e'`,
      );
      expect(restos).toEqual([]);
      await limpia.exec(MIGRACION);
      expect((await una(limpia, `select count(*)::int as n from pg_class where relname = 'movimientos'`)).n).toBe(1);
    } finally {
      await limpia.close();
    }
  });
});
