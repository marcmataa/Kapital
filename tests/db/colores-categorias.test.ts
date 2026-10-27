/**
 * Migración 20261027000000_colores_categorias.sql: Ropa y Regalos cambian de color por defecto
 * (backfill que respeta los colores elegidos por el usuario, onboarding) y rollback.
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MIGRACIONES, MIGRACION_COLORES_CATEGORIAS, ROLLBACK_COLORES_CATEGORIAS, actuarComo, conRol, crearDb, todas,
} from './helpers.js';

let db: PGlite;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

const ANTERIORES = MIGRACIONES.indexOf(MIGRACION_COLORES_CATEGORIAS);

async function nuevoUsuario(base: PGlite): Promise<string> {
  const id = randomUUID();
  await base.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@test.local`]);
  return id;
}

async function onboarding(base: PGlite, id: string): Promise<void> {
  await actuarComo(base, id);
  await conRol(base, 'authenticated', async () => {
    // Un banco: el mínimo que pide el onboarding.
    const bancos = [{ entidad: 'bbva', nombre: '', color: null, saldo: '100,00' }];
    await base.query(`select completar_onboarding('es', $1::jsonb, '0')`, [JSON.stringify(bancos)]);
  });
}

const colores = async (base: PGlite, id: string) =>
  Object.fromEntries(
    (await todas<{ clave: string; color: string }>(
      base, `select clave, color from categorias where user_id = $1 and clave is not null`, [id],
    )).map((f) => [f.clave, f.color]),
  );

describe('colores de categoría', () => {
  it('el onboarding crea Ropa marrón y Regalos menta; los demás no cambian', async () => {
    const id = await nuevoUsuario(db);
    await onboarding(db, id);
    const c = await colores(db, id);
    expect(c.ropa).toBe('#c2885a');
    expect(c.regalos).toBe('#2dd4bf');
    expect(c.ocio).toBe('#9b6bff');
    expect(c.transporte).toBe('#3b82ff');
    expect(c.salud).toBe('#ef4444');
  });

  it('preparar_usuario también usa los colores nuevos', async () => {
    const id = await nuevoUsuario(db);
    await db.query(`select preparar_usuario($1)`, [`${id}@test.local`]);
    const c = await colores(db, id);
    expect([c.ropa, c.regalos]).toEqual(['#c2885a', '#2dd4bf']);
  });

  it('backfill: cambia solo los colores por defecto, nunca uno elegido por el usuario; el down los devuelve', async () => {
    const vieja = await crearDb({ hasta: ANTERIORES });
    try {
      const porDefecto = await nuevoUsuario(vieja);
      const elegido = await nuevoUsuario(vieja);
      await onboarding(vieja, porDefecto);
      await onboarding(vieja, elegido);
      await vieja.query(`update categorias set color = '#123456' where user_id = $1 and clave = 'ropa'`, [elegido]);

      await vieja.exec(MIGRACION_COLORES_CATEGORIAS);
      expect([(await colores(vieja, porDefecto)).ropa, (await colores(vieja, porDefecto)).regalos]).toEqual(['#c2885a', '#2dd4bf']);
      expect((await colores(vieja, elegido)).ropa).toBe('#123456');
      expect((await colores(vieja, elegido)).regalos).toBe('#2dd4bf');

      await vieja.exec(ROLLBACK_COLORES_CATEGORIAS);
      expect([(await colores(vieja, porDefecto)).ropa, (await colores(vieja, porDefecto)).regalos]).toEqual(['#6366f1', '#f43f5e']);
      expect((await colores(vieja, elegido)).ropa).toBe('#123456');
      const tras = await nuevoUsuario(vieja);
      await onboarding(vieja, tras);
      expect((await colores(vieja, tras)).ropa).toBe('#6366f1');
    } finally {
      await vieja.close();
    }
  });
});
