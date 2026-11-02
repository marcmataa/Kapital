/**
 * Editar y eliminar objetivos (Inicio y Configuración): cada usuario solo modifica o borra los
 * suyos. Lo garantiza la política `solo_mis_datos` (for all to authenticated, using + with check
 * user_id = auth.uid()) del esquema inicial; aquí se comprueba con el rol `authenticated` real.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actuarComo, conRol, crearCategoria, crearDb, crearUsuario, todas, una } from './helpers.js';

let db: PGlite;
let a: string;
let b: string;
let ocioA: string;
let ocioB: string;
let ahorroA: string;
let limiteA: string;

async function crearObjetivo(
  userId: string,
  tipo: 'ahorro_mensual' | 'limite_categoria',
  importe: string,
  categoria: string | null = null,
): Promise<string> {
  const fila = await una<{ id: string }>(
    db,
    `insert into objetivos (user_id, tipo, categoria_id, importe) values ($1, $2, $3, $4) returning id`,
    [userId, tipo, categoria, importe],
  );
  return fila.id;
}

const objetivo = (id: string) =>
  una<{ user_id: string; tipo: string; categoria_id: string | null; importe: string; activo: boolean }>(
    db,
    `select user_id, tipo::text, categoria_id, importe::text, activo from objetivos where id = $1`,
    [id],
  );

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  a = await crearUsuario(db);
  ocioA = await crearCategoria(db, a, 'Ocio', 'gasto');
  ahorroA = await crearObjetivo(a, 'ahorro_mensual', '500.00');
  limiteA = await crearObjetivo(a, 'limite_categoria', '200.00', ocioA);
  b = await crearUsuario(db);
  ocioB = await crearCategoria(db, b, 'Ocio', 'gasto');
});

describe('objetivos: cada usuario edita y borra solo los suyos', () => {
  it('el dueño cambia todos los campos (tipo, categoría e importe) y lo desactiva', async () => {
    const ropaA = await crearCategoria(db, a, 'Ropa', 'gasto');
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      const editado = await db.query(
        `update objetivos set tipo = 'limite_categoria', categoria_id = $2, importe = '120.50' where id = $1`,
        [ahorroA, ropaA],
      );
      expect(editado.affectedRows).toBe(1);
      await db.query(`update objetivos set activo = false where id = $1`, [limiteA]);
    });
    expect(await objetivo(ahorroA)).toMatchObject({
      tipo: 'limite_categoria', categoria_id: ropaA, importe: '120.50', activo: true,
    });
    expect((await objetivo(limiteA)).activo).toBe(false);
  });

  it('el usuario B no puede editar, desactivar ni borrar los objetivos de A', async () => {
    await actuarComo(db, b);
    await conRol(db, 'authenticated', async () => {
      expect(await todas(db, `select id from objetivos where user_id = $1`, [a])).toEqual([]);
      expect((await db.query(`update objetivos set importe = 1 where id = $1`, [ahorroA])).affectedRows).toBe(0);
      expect((await db.query(`update objetivos set activo = false where id = $1`, [limiteA])).affectedRows).toBe(0);
      expect((await db.query(`delete from objetivos where id = $1`, [ahorroA])).affectedRows).toBe(0);
    });
    expect(await objetivo(ahorroA)).toMatchObject({ user_id: a, importe: '500.00', activo: true });
    expect(await objetivo(limiteA)).toMatchObject({ user_id: a, activo: true });
  });

  it('el dueño no puede regalar su objetivo a otro usuario (user_id no cambia)', async () => {
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      await expect(db.query(`update objetivos set user_id = $2 where id = $1`, [ahorroA, b])).rejects.toThrow(
        /row-level security/,
      );
    });
    expect((await objetivo(ahorroA)).user_id).toBe(a);
  });

  it('un objetivo no puede apuntar a la categoría de otro usuario (aunque se salte RLS)', async () => {
    // Lo para antes el trigger validar_objetivo (categoría de gasto DEL MISMO usuario, 23514);
    // detrás queda la clave foránea compuesta (categoria_id, user_id).
    await expect(db.query(`update objetivos set categoria_id = $2 where id = $1`, [limiteA, ocioB])).rejects.toMatchObject(
      { code: '23514' },
    );
    expect((await objetivo(limiteA)).categoria_id).toBe(ocioA);
  });

  it('el dueño borra sus objetivos', async () => {
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      expect((await db.query(`delete from objetivos where id = $1`, [ahorroA])).affectedRows).toBe(1);
    });
    expect(await todas(db, `select id from objetivos where id = $1`, [ahorroA])).toEqual([]);
  });

  it('editar respeta los índices únicos: un ahorro activo y un límite activo por categoría (23505)', async () => {
    const limite2 = await crearObjetivo(a, 'limite_categoria', '90.00', await crearCategoria(db, a, 'Cine', 'gasto'));
    await actuarComo(db, a);
    await conRol(db, 'authenticated', async () => {
      await expect(
        db.query(`update objetivos set tipo = 'ahorro_mensual', categoria_id = null where id = $1`, [limite2]),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(db.query(`update objetivos set categoria_id = $2 where id = $1`, [limite2, ocioA])).rejects.toMatchObject(
        { code: '23505' },
      );
    });
  });

  it('el rol anónimo no toca objetivos', async () => {
    await actuarComo(db, null);
    await conRol(db, 'anon', async () => {
      await expect(db.query(`update objetivos set importe = 1 where id = $1`, [ahorroA])).rejects.toThrow(/permission denied/);
      await expect(db.query(`delete from objetivos where id = $1`, [ahorroA])).rejects.toThrow(/permission denied/);
    });
  });
});
