/**
 * RPC registrar_movimiento: la puerta de entrada del atajo del iPhone.
 * Se llama como lo hace PostgREST con la clave anon: rol `anon` + token personal.
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actuarComo, conRol, crearDb, todas, una } from './helpers.js';

interface Respuesta { ok: boolean; id?: string; error?: string; mensaje?: string; duplicado?: boolean }
type Parametro = 'token' | 'tipo' | 'importe' | 'concepto' | 'categoria' | 'metodo' | 'fecha' | 'comercio' | 'desde' | 'hacia' | 'clave';

let db: PGlite;
let u: string;
let token: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  u = randomUUID();
  const email = `${u}@test.local`;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u, email]);
  ({ token } = await una<{ token: string }>(db, `select preparar_usuario($1) as token`, [email]));
  await actuarComo(db, null);
});

/** Llama a la RPC como el atajo: rol anon, sin sesión, con parámetros con nombre. */
async function atajo(p: Partial<Record<Parametro, string>>): Promise<Respuesta> {
  const args = { token, ...p };
  const nombres = Object.keys(args) as Parametro[];
  const sql = `select registrar_movimiento(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  return conRol(db, 'anon', async () => (await una<{ r: Respuesta }>(db, sql, nombres.map((n) => args[n]))).r);
}

async function guardado(id: string | undefined) {
  return una(
    db,
    `select m.tipo::text, m.importe::text, m.metodo::text, m.origen::text, m.sentido::text, m.concepto, m.fecha::text,
            c.nombre as cuenta, d.nombre as destino, cat.nombre as categoria
     from movimientos m
     join cuentas c on c.id = m.cuenta_id
     left join cuentas d on d.id = m.cuenta_destino_id
     left join categorias cat on cat.id = m.categoria_id
     where m.id = $1`,
    [id],
  );
}

describe('registrar_movimiento', () => {
  it('registra un gasto con importe en formato español en la cuenta principal y con la fecha de hoy en Madrid', async () => {
    const r = await atajo({ tipo: 'Gasto', importe: '38,5', concepto: 'Cena', categoria: 'restaurantes' });
    expect(r).toMatchObject({ ok: true, mensaje: '✅ Gasto de 38,50 € · Restaurantes' });
    expect(await guardado(r.id)).toMatchObject({
      tipo: 'gasto', importe: '38.50', metodo: 'tarjeta', origen: 'atajo', cuenta: 'BBVA', categoria: 'Restaurantes',
    });
    const { hoy } = await una<{ hoy: boolean }>(
      db, `select fecha = fecha_local(now(), 'Europe/Madrid') as hoy from movimientos where id = $1`, [r.id],
    );
    expect(hoy).toBe(true);
  });

  it('con comercio y sin método es Apple Pay; en efectivo sale de la cuenta de efectivo', async () => {
    const applePay = await atajo({ tipo: 'gasto', importe: '12.40', comercio: 'Mercadona', categoria: 'Otros gastos' });
    expect(await guardado(applePay.id)).toMatchObject({ metodo: 'apple_pay', origen: 'apple_pay', concepto: 'Mercadona' });

    const efectivo = await atajo({ tipo: 'gasto', importe: '3', concepto: 'Café', categoria: 'Restaurantes', metodo: 'Efectivo' });
    expect(await guardado(efectivo.id)).toMatchObject({ metodo: 'efectivo', cuenta: 'Efectivo' });
  });

  it('ingreso de 1.258,00 € y rendimiento cobrado en Trade Republic (categoría Rendimientos por defecto)', async () => {
    const nomina = await atajo({ tipo: 'Ingreso', importe: '1.258,00', concepto: 'Nómina', categoria: 'Nómina', metodo: 'transferencia' });
    expect(nomina.mensaje).toBe('✅ Ingreso de 1.258,00 € · Nómina');
    expect(await guardado(nomina.id)).toMatchObject({ importe: '1258.00', cuenta: 'BBVA' });

    const dividendo = await atajo({ tipo: 'rendimiento', importe: '3,20', concepto: 'Dividendo', hacia: 'Trade Republic', metodo: 'transferencia' });
    expect(await guardado(dividendo.id)).toMatchObject({ tipo: 'ingreso', categoria: 'Rendimientos', cuenta: 'Trade Republic' });
  });

  it('traspaso necesita desde y hacia distintos', async () => {
    expect(await atajo({ tipo: 'traspaso', importe: '100', desde: 'BBVA' }))
      .toEqual({ ok: false, error: 'Un traspaso necesita "desde" y "hacia" con cuentas distintas.' });
    const r = await atajo({ tipo: 'Traspaso', importe: '100', desde: 'BBVA', hacia: 'trade republic' });
    expect(await guardado(r.id)).toMatchObject({ tipo: 'traspaso', cuenta: 'BBVA', destino: 'Trade Republic', metodo: null });
  });

  it('un ajuste toma el sentido del signo del importe', async () => {
    const resta = await atajo({ tipo: 'ajuste', importe: '-10,00', concepto: 'Descuadre' });
    const suma = await atajo({ tipo: 'ajuste', importe: '4', concepto: 'Descuadre' });
    expect(await guardado(resta.id)).toMatchObject({ sentido: 'resta', importe: '10.00', categoria: null });
    expect(await guardado(suma.id)).toMatchObject({ sentido: 'suma' });
  });

  it('un reintento con la misma clave no duplica el movimiento', async () => {
    const clave = randomUUID();
    const primero = await atajo({ tipo: 'gasto', importe: '9,91', categoria: 'Ocio', clave });
    const segundo = await atajo({ tipo: 'gasto', importe: '9,91', categoria: 'Ocio', clave });
    expect(segundo).toMatchObject({ ok: true, id: primero.id, duplicado: true });
    const filas = await todas(db, `select 1 from movimientos where user_id = $1 and clave_idempotencia = $2`, [u, clave]);
    expect(filas).toHaveLength(1);
  });

  it('respeta la fecha real enviada y rechaza fechas inválidas o futuras', async () => {
    const r = await atajo({ tipo: 'gasto', importe: '20', categoria: 'Ocio', fecha: '2026-09-12' });
    expect(await guardado(r.id)).toMatchObject({ fecha: '2026-09-12' });
    expect((await atajo({ tipo: 'gasto', importe: '20', categoria: 'Ocio', fecha: 'ayer' })).error)
      .toBe('Fecha no válida: ayer (usa yyyy-MM-dd)');
    expect((await atajo({ tipo: 'gasto', importe: '20', categoria: 'Ocio', fecha: '2999-01-01' })).error)
      .toBe('La fecha está en el futuro: 2999-01-01');
  });

  it('devuelve errores legibles: token, tipo, importe, categoría y reglas de la base', async () => {
    expect(await atajo({ token: 'mf_falso', tipo: 'gasto', importe: '1' }))
      .toEqual({ ok: false, error: 'Token no válido. Revisa el token del atajo.' });
    expect((await atajo({ tipo: 'regalo', importe: '1' })).error).toBe('Tipo no reconocido: regalo');
    expect((await atajo({ tipo: 'gasto', importe: 'abc' })).error).toBe('Importe no válido: abc');
    expect((await atajo({ tipo: 'gasto', importe: '0,00', categoria: 'Ocio' })).error).toBe('Importe no válido: 0,00');
    expect((await atajo({ tipo: 'gasto', importe: '1', categoria: 'Viajes' })).error)
      .toBe('Categoría no encontrada: Viajes. Válidas: Restaurantes, Ocio, Transporte, Suscripciones, ' +
        'Supermercado, Hogar, Salud, Deporte, Cuidado personal, Ropa, Regalos, Otros gastos');

    await db.query(`update cuentas set fecha_inicial = '2026-01-01' where user_id = $1 and nombre = 'BBVA'`, [u]);
    expect((await atajo({ tipo: 'gasto', importe: '1', categoria: 'Ocio', fecha: '2025-12-31' })).error)
      .toBe('La cuenta BBVA empieza el 2026-01-01; el movimiento es del 2025-12-31');
  });

  it('un token revocado deja de funcionar', async () => {
    await db.query(`update tokens_api set revocado = true where user_id = $1`, [u]);
    expect((await atajo({ tipo: 'gasto', importe: '1', categoria: 'Ocio' })).ok).toBe(false);
  });

  it('el atajo solo puede usar la RPC: con la clave anon no se leen tablas ni otras funciones', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select * from tokens_api`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select * from movimientos`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select patrimonio('2026-10-01')`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select preparar_usuario('x@y.z')`)).rejects.toThrow(/permission denied/);
    });
  });
});
