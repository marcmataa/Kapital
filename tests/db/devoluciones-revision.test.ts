/**
 * Migración 20261102000002_devoluciones_revision.sql: lista de devoluciones pendientes de revisión
 * (docs/reglas-financieras.md, sección 3). Solo lectura; nunca vincula ni cambia nada. Cifras
 * inventadas.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_DEVOLUCIONES_REVISION, ROLLBACK_DEVOLUCIONES_REVISION, actuarComo, conRol, crearCategoria, crearCuenta,
  crearDb, crearUsuario, devolucionAntigua, mov, todas,
} from './helpers.js';

let db: PGlite;
let u: string;
let bbva: string;
let ocio: string;
let comida: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  u = await crearUsuario(db);
  bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', fechaInicial: '2024-01-01', principal: true });
  ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  comida = await crearCategoria(db, u, 'Comida', 'gasto');
});

type Pendiente = { id: string; motivo: string; importe: string; gasto_id: string | null };

async function pendientes(usuario = u): Promise<Pendiente[]> {
  await actuarComo(db, usuario);
  return conRol(db, 'authenticated', async () =>
    (await db.query<Pendiente>(`select id, motivo, importe::text, gasto_id from devoluciones_pendientes_revision()`)).rows);
}

const gasto = (importe: string, fecha: string, categoria = ocio) =>
  mov(db, u, { tipo: 'gasto', importe, fecha, cuenta: bbva, categoria, concepto: 'Cena' });

describe('devoluciones_pendientes_revision', () => {
  it('lista las antiguas sin vincular y las vinculadas que incumplen las reglas, con su motivo', async () => {
    const cena = await gasto('80.00', '2026-10-10');
    const sinVincular = await mov(db, u, { tipo: 'devolucion', importe: '9.91', fecha: '2026-09-25', cuenta: bbva, categoria: comida });
    // Datos antiguos, anteriores a la validación de 20261102000001: se insertan sin el trigger.
    const antesDeLaCompra = await devolucionAntigua(db, u, {
      tipo: 'devolucion', importe: '10.00', fecha: '2026-10-09', cuenta: bbva, categoria: ocio, devolucionDe: cena,
    });
    const otraCategoria = await devolucionAntigua(db, u, {
      tipo: 'devolucion', importe: '5.00', fecha: '2026-10-12', cuenta: bbva, categoria: comida, devolucionDe: cena,
    });
    // Una devolución correcta no aparece.
    await mov(db, u, { tipo: 'devolucion', importe: '20.00', fecha: '2026-10-11', cuenta: bbva, categoria: ocio, devolucionDe: cena });

    const filas = await pendientes();
    expect(filas.map((f) => [f.id, f.motivo, f.importe])).toEqual([
      [otraCategoria, 'otra_categoria', '5.00'],
      [antesDeLaCompra, 'fecha_anterior', '10.00'],
      [sinVincular, 'sin_vincular', '9.91'],
    ]);
    expect(filas.find((f) => f.id === sinVincular)?.gasto_id).toBeNull();
    expect(filas.find((f) => f.id === otraCategoria)?.gasto_id).toBe(cena);
  });

  it('al vincular una devolución antigua desde la app deja de estar pendiente y nada se vincula solo', async () => {
    const cena = await gasto('80.00', '2026-09-20');
    const vieja = await mov(db, u, { tipo: 'devolucion', importe: '9.91', fecha: '2026-09-25', cuenta: bbva, categoria: comida });
    expect((await pendientes()).map((f) => f.id)).toEqual([vieja]);
    // Leer la lista no cambia nada.
    expect(await todas(db, `select devolucion_de from movimientos where id = $1`, [vieja])).toEqual([{ devolucion_de: null }]);

    await actuarComo(db, u);
    await conRol(db, 'authenticated', () =>
      db.query(`update movimientos set devolucion_de = $1 where id = $2`, [cena, vieja]));
    expect(await pendientes()).toEqual([]);
    // Al vincularla toma la categoría del gasto.
    expect(await todas(db, `select categoria_id from movimientos where id = $1`, [vieja])).toEqual([{ categoria_id: ocio }]);
  });

  it('cada usuario solo ve las suyas', async () => {
    await mov(db, u, { tipo: 'devolucion', importe: '9.91', fecha: '2026-09-25', cuenta: bbva, categoria: comida });
    const otro = await crearUsuario(db);
    expect(await pendientes(otro)).toEqual([]);
    expect(await pendientes()).toHaveLength(1);
  });

  it('anon no la puede ejecutar', async () => {
    await actuarComo(db, null);
    await expect(conRol(db, 'anon', () => db.query(`select * from devoluciones_pendientes_revision()`)))
      .rejects.toThrow(/permission denied/);
  });
});

describe('rollback', () => {
  it('el down quita la función sin tocar datos y la migración se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec(ROLLBACK_DEVOLUCIONES_REVISION);
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'devoluciones_pendientes_revision'`)).toEqual([]);
      await limpia.exec(MIGRACION_DEVOLUCIONES_REVISION);
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'devoluciones_pendientes_revision'`)).toHaveLength(1);
    } finally {
      await limpia.close();
    }
  });
});
