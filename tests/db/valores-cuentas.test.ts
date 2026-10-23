/**
 * Migración 20261023000000_valores_cuentas.sql: valor de cada cuenta al cierre de D,
 * para el desglose del patrimonio por cuenta (secciones 4 y 6). Datos inventados.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_VALORES_CUENTAS, ROLLBACK_VALORES_CUENTAS, actuarComo, conRol, crearCategoria, crearCuenta, crearDb,
  crearUsuario, mov,
  patrimonio, todas, valorar,
} from './helpers.js';

let db: PGlite;
let u: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { u = await crearUsuario(db); });

type Fila = { cuenta_id: string; valor: string };

/** valores_cuentas(D) como la pide la app: rol authenticated, importes como texto. */
async function valores(fecha: string, usuario = u): Promise<Map<string, string>> {
  await actuarComo(db, usuario);
  const filas = await conRol(db, 'authenticated', () =>
    todas<Fila>(db, `select cuenta_id, valor::text as valor from valores_cuentas($1)`, [fecha]),
  );
  return new Map(filas.map((f) => [f.cuenta_id, f.valor]));
}

/** Cuentas de un usuario: banco con movimientos, inversión con valoración, pasivo, una abierta después y una cerrada. */
async function escenario() {
  const banco = await crearCuenta(db, u, { nombre: 'Banco Prueba', saldoInicial: '1000.00', fechaInicial: '2026-01-01' });
  const broker = await crearCuenta(db, u, { nombre: 'Bróker Prueba', tipo: 'inversion', saldoInicial: '500.00', fechaInicial: '2026-02-01' });
  const tarjeta = await crearCuenta(db, u, { nombre: 'Tarjeta Prueba', tipo: 'pasivo', saldoInicial: '300.00', fechaInicial: '2026-03-01' });
  const nueva = await crearCuenta(db, u, { nombre: 'Banco Nuevo', saldoInicial: '50.00', fechaInicial: '2026-10-05' });
  const cerrada = await crearCuenta(db, u, { nombre: 'Efectivo Viejo', tipo: 'efectivo', saldoInicial: '0.00', fechaInicial: '2026-01-01' });
  const gasto = await crearCategoria(db, u, 'Gasto Prueba', 'gasto');
  const ingreso = await crearCategoria(db, u, 'Ingreso Prueba', 'ingreso');
  await mov(db, u, { tipo: 'gasto', importe: '120.35', fecha: '2026-09-10', cuenta: banco, categoria: gasto });
  await mov(db, u, { tipo: 'ingreso', importe: '0.10', fecha: '2026-09-11', cuenta: banco, categoria: ingreso });
  await mov(db, u, { tipo: 'ingreso', importe: '0.20', fecha: '2026-09-12', cuenta: banco, categoria: ingreso });
  await mov(db, u, { tipo: 'gasto', importe: '10.00', fecha: '2026-10-01', cuenta: banco, categoria: gasto });
  await valorar(db, u, broker, '2026-09-20', '612.45');
  await db.query(`update cuentas set fecha_cierre = '2026-06-30' where id = $1`, [cerrada]);
  return { banco, broker, tarjeta, nueva, cerrada };
}

describe('valores_cuentas(D)', () => {
  it('valor exacto de cada cuenta al cierre de D; el pasivo, en negativo', async () => {
    const c = await escenario();
    const v = await valores('2026-09-30');
    expect(v.get(c.banco)).toBe('879.95'); // 1000 − 120,35 + 0,10 + 0,20
    expect(v.get(c.broker)).toBe('612.45');
    expect(v.get(c.tarjeta)).toBe('-300.00');
  });

  it('la suma de los valores es patrimonio(D)', async () => {
    await escenario();
    for (const fecha of ['2026-01-31', '2026-06-30', '2026-09-30', '2026-10-05']) {
      await actuarComo(db, u);
      const { s } = (await todas<{ s: string | null }>(db, `select sum(valor)::text as s from valores_cuentas($1)`, [fecha]))[0] ?? { s: null };
      expect(s, fecha).toBe(await patrimonio(db, fecha));
    }
  });

  it('fuera la cuenta que aún no existía en D y la cerrada en o antes de D', async () => {
    const c = await escenario();
    const sept = await valores('2026-09-30');
    expect(sept.has(c.nueva)).toBe(false);
    expect(sept.has(c.cerrada)).toBe(false);
    expect((await valores('2026-06-30')).has(c.cerrada)).toBe(false); // cerrada ese mismo día
    expect((await valores('2026-06-29')).get(c.cerrada)).toBe('0.00'); // aún abierta
    expect((await valores('2026-10-05')).get(c.nueva)).toBe('50.00'); // el día que se abre
  });

  it('solo devuelve las cuentas del usuario de la sesión (RLS)', async () => {
    const c = await escenario();
    const otro = await crearUsuario(db);
    const suya = await crearCuenta(db, otro, { nombre: 'Banco Ajeno', saldoInicial: '9.99' });
    const mias = await valores('2026-09-30');
    expect(mias.has(suya)).toBe(false);
    const suyas = await valores('2026-09-30', otro);
    expect([...suyas.keys()]).toEqual([suya]);
    expect(suyas.has(c.banco)).toBe(false);
  });

  it('anon no puede ejecutarla; authenticated sí', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select * from valores_cuentas('2026-09-30')`)).rejects.toThrow(/permission denied/);
    });
    const { rows } = await db.query<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'valores_cuentas(date)', 'execute') as anon,
              has_function_privilege('authenticated', 'valores_cuentas(date)', 'execute') as auth`,
    );
    expect(rows[0]).toEqual({ anon: false, auth: true });
  });

  it('el rollback la quita y la migración se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec(ROLLBACK_VALORES_CUENTAS);
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'valores_cuentas'`)).toEqual([]);
      await limpia.exec(MIGRACION_VALORES_CUENTAS);
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'valores_cuentas'`)).toHaveLength(1);
    } finally {
      await limpia.close();
    }
  });
});
