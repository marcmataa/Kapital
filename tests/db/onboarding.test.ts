/**
 * Registro restringido, perfil automático, límite de 5 bancos, onboarding y
 * crear_banco (migración 20261019000000_onboarding_y_analisis.sql).
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actuarComo, conRol, crearCuenta, crearDb, crearUsuario, todas, una } from './helpers.js';

let db: PGlite;
let u: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { u = await crearUsuario(db); });

type Banco = { entidad: string | null; nombre: string; color: string | null; saldo: string };

/** Llama a completar_onboarding como la web: rol authenticated con la sesión del usuario. */
async function onboarding(idioma: string, bancos: unknown, efectivo: string | null): Promise<void> {
  await actuarComo(db, u);
  await conRol(db, 'authenticated', async () => {
    await db.query(`select completar_onboarding($1, $2::jsonb, $3)`, [idioma, JSON.stringify(bancos), efectivo]);
  });
}

async function crearBanco(entidad: string | null, nombre: string | null, color: string | null, saldo: string | null) {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () =>
    (await una<{ id: string }>(db, `select crear_banco($1, $2, $3, $4) as id`, [entidad, nombre, color, saldo])).id);
}

const bancoBbva: Banco = { entidad: 'bbva', nombre: '', color: null, saldo: '1.258,50' };

describe('registro restringido', () => {
  let cerrada: PGlite;
  beforeAll(async () => { cerrada = await crearDb({ registroAbierto: false }); });
  afterAll(async () => { await cerrada.close(); });

  const alta = (email: string | null) =>
    cerrada.query(`insert into auth.users (id, email) values ($1, $2)`, [randomUUID(), email]);

  it('está cerrado por defecto y rechaza emails no permitidos (y sin email)', async () => {
    expect((await una(cerrada, `select abierto from registro_config`)).abierto).toBe(false);
    await expect(alta('desconocida@ejemplo.test')).rejects.toThrow(/registro_cerrado/);
    await expect(alta(null)).rejects.toThrow(/registro_cerrado/);
  });

  it('deja pasar un email permitido sin distinguir mayúsculas', async () => {
    await cerrada.query(`insert into registro_permitidos (email) values ('invitada@ejemplo.test')`);
    await expect(alta('  Invitada@EJEMPLO.test')).resolves.toBeDefined();
  });

  it('abierto, deja pasar cualquier email', async () => {
    await cerrada.query(`update registro_config set abierto = true`);
    try {
      await expect(alta('cualquiera@ejemplo.test')).resolves.toBeDefined();
    } finally {
      await cerrada.query(`update registro_config set abierto = false`);
    }
  });

  it('solo hay una fila de configuración', async () => {
    await expect(cerrada.query(`insert into registro_config (id, abierto) values (false, true)`)).rejects.toThrow(/check/);
    await expect(cerrada.query(`insert into registro_config (abierto) values (true)`)).rejects.toThrow(/duplicate key/);
  });

  it('ni anon ni authenticated pueden leer ni cambiar el registro', async () => {
    for (const rol of ['anon', 'authenticated'] as const) {
      await conRol(cerrada, rol, async () => {
        await expect(cerrada.query(`select * from registro_permitidos`)).rejects.toThrow(/permission denied/);
        await expect(cerrada.query(`insert into registro_permitidos (email) values ('x@ejemplo.test')`))
          .rejects.toThrow(/permission denied/);
        await expect(cerrada.query(`update registro_config set abierto = true`)).rejects.toThrow(/permission denied/);
      });
    }
  });
});

describe('perfil automático', () => {
  it('un usuario nuevo de Auth recibe su perfil con onboarding pendiente', async () => {
    const p = await una(db, `select zona_horaria, idioma, onboarding_completado from perfiles where user_id = $1`, [u]);
    expect(p).toEqual({ zona_horaria: 'Europe/Madrid', idioma: 'es', onboarding_completado: false });
  });
});

describe('máximo 5 bancos abiertos', () => {
  it('el sexto banco falla; efectivo e inversión no cuentan', async () => {
    for (let i = 1; i <= 5; i++) await crearCuenta(db, u, { nombre: `Banco ${i}` });
    await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo' });
    await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion' });
    await expect(crearCuenta(db, u, { nombre: 'Banco 6' })).rejects.toThrow(/5 bancos abiertos/);
    // Desde la app (RLS) también.
    await conRol(db, 'authenticated', async () => {
      await expect(db.query(`insert into cuentas (nombre) values ('Banco 6')`)).rejects.toThrow(/5 bancos abiertos/);
    });
  });

  it('cerrar un banco libera un hueco; reabrirlo o convertir otra cuenta en banco no puede pasar del límite', async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) ids.push(await crearCuenta(db, u, { nombre: `Banco ${i}` }));
    const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo' });

    await db.query(`update cuentas set fecha_cierre = '2026-02-01' where id = $1`, [ids[0]]);
    await crearCuenta(db, u, { nombre: 'Banco 6' });

    await expect(db.query(`update cuentas set fecha_cierre = null where id = $1`, [ids[0]])).rejects.toThrow(/5 bancos abiertos/);
    await expect(db.query(`update cuentas set tipo = 'banco' where id = $1`, [efectivo])).rejects.toThrow(/5 bancos abiertos/);
    // Cambiar otros datos de un banco que ya cuenta no choca con el límite.
    await db.query(`update cuentas set nombre = 'Banco 2 bis' where id = $1`, [ids[1]]);
  });

  it('el límite es por usuario', async () => {
    for (let i = 1; i <= 5; i++) await crearCuenta(db, u, { nombre: `Banco ${i}` });
    const otro = await crearUsuario(db);
    await expect(crearCuenta(db, otro, { nombre: 'Banco 1' })).resolves.toBeTypeOf('string');
  });

  it('entidad solo admite el catálogo y color solo #rrggbb', async () => {
    await expect(db.query(`insert into cuentas (user_id, nombre, entidad) values ($1, 'N26', 'n26')`, [u]))
      .rejects.toThrow(/check/);
    await expect(db.query(`insert into cuentas (user_id, nombre, color) values ($1, 'Rara', 'red;}')`, [u]))
      .rejects.toThrow(/check/);
  });
});

describe('completar_onboarding', () => {
  it('crea bancos, efectivo y categorías, fija el idioma y marca el onboarding', async () => {
    await onboarding('ca', [
      bancoBbva,
      { entidad: null, nombre: 'Caja de prueba', color: '#12AB34', saldo: '0' },
      { entidad: 'trade_republic', nombre: 'TR efectivo', color: null, saldo: '38,5' },
    ], '120');

    const { hoy } = await una<{ hoy: string }>(db, `select hoy_usuario()::text as hoy`);
    const cuentas = await todas(
      db,
      `select nombre, tipo::text, entidad, color, saldo_inicial::text as saldo, fecha_inicial::text as fecha,
              es_principal, orden
       from cuentas where user_id = $1 order by orden`,
      [u],
    );
    expect(cuentas).toEqual([
      { nombre: 'BBVA', tipo: 'banco', entidad: 'bbva', color: null, saldo: '1258.50', fecha: hoy, es_principal: true, orden: 1 },
      { nombre: 'Caja de prueba', tipo: 'banco', entidad: null, color: '#12AB34', saldo: '0.00', fecha: hoy, es_principal: false, orden: 2 },
      { nombre: 'TR efectivo', tipo: 'banco', entidad: 'trade_republic', color: null, saldo: '38.50', fecha: hoy, es_principal: false, orden: 3 },
      { nombre: 'Efectivo', tipo: 'efectivo', entidad: null, color: null, saldo: '120.00', fecha: hoy, es_principal: false, orden: 4 },
    ]);

    const perfil = await una(db, `select idioma, onboarding_completado from perfiles where user_id = $1`, [u]);
    expect(perfil).toEqual({ idioma: 'ca', onboarding_completado: true });
  });

  it('crea las mismas categorías por defecto que preparar_usuario', async () => {
    await onboarding('es', [bancoBbva], '0');
    const otro = randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [otro, `${otro}@test.local`]);
    await db.query(`select preparar_usuario($1)`, [`${otro}@test.local`]);

    const categorias = (id: string) => todas(
      db, `select nombre, tipo::text, color, icono, orden from categorias where user_id = $1 order by orden`, [id],
    );
    const mias = await categorias(u);
    expect(mias).toHaveLength(8);
    expect(mias).toEqual(await categorias(otro));
  });

  it('una segunda llamada falla y no crea nada más', async () => {
    await onboarding('es', [bancoBbva], '0');
    await expect(onboarding('en', [{ ...bancoBbva, entidad: 'ing' }], '5')).rejects.toThrow(/ya está completado/);
    expect((await una(db, `select count(*)::int as n from cuentas where user_id = $1`, [u])).n).toBe(2);
    expect((await una(db, `select idioma from perfiles where user_id = $1`, [u])).idioma).toBe('es');
  });

  const seisBancos = Array.from({ length: 6 }, (_, i) => ({ entidad: null, nombre: `Banco ${i}`, color: null, saldo: '1' }));
  const invalidos: [string, string, unknown, string | null, RegExp][] = [
    ['idioma desconocido', 'fr', [bancoBbva], '0', /Idioma no válido/],
    ['sin bancos', 'es', [], '0', /entre 1 y 5/],
    ['más de 5 bancos', 'es', seisBancos, '0', /entre 1 y 5/],
    ['bancos que no son un array', 'es', bancoBbva, '0', /entre 1 y 5/],
    ['un banco que no es un objeto', 'es', ['bbva'], '0', /debe ser un objeto/],
    ['entidad fuera del catálogo', 'es', [{ ...bancoBbva, entidad: 'n26' }], '0', /no reconocido/],
    ['banco propio sin nombre', 'es', [{ entidad: null, nombre: '  ', color: null, saldo: '1' }], '0', /nombre del banco/],
    ['saldo con letras', 'es', [{ ...bancoBbva, saldo: 'mil' }], '0', /Saldo no válido/],
    ['saldo vacío', 'es', [{ ...bancoBbva, saldo: '' }], '0', /Saldo no válido/],
    ['saldo ausente', 'es', [{ entidad: 'bbva', nombre: 'BBVA', color: null }], '0', /Saldo no válido/],
    ['saldo negativo', 'es', [{ ...bancoBbva, saldo: '-5' }], '0', /Saldo no válido/],
    ['saldo mal formado', 'es', [{ ...bancoBbva, saldo: '1.2.3' }], '0', /Saldo no válido/],
    ['efectivo vacío', 'es', [bancoBbva], '', /Saldo no válido/],
    ['efectivo nulo', 'es', [bancoBbva], null, /Saldo no válido/],
    ['color no hexadecimal', 'es', [{ ...bancoBbva, color: 'red' }], '0', /check/],
    ['dos bancos con el mismo nombre', 'es', [bancoBbva, { ...bancoBbva }], '0', /Ya tienes una cuenta llamada «BBVA»/],
  ];
  it.each(invalidos)('rechaza %s sin dejar datos a medias', async (_caso, idioma, bancos, efectivo, error) => {
    await expect(onboarding(idioma, bancos, efectivo)).rejects.toThrow(error);
    expect((await una(db, `select count(*)::int as n from cuentas where user_id = $1`, [u])).n).toBe(0);
    expect((await una(db, `select count(*)::int as n from categorias where user_id = $1`, [u])).n).toBe(0);
    expect((await una(db, `select onboarding_completado as o from perfiles where user_id = $1`, [u])).o).toBe(false);
  });

  it('sin sesión no hace nada', async () => {
    await actuarComo(db, null);
    await expect(conRol(db, 'authenticated', () =>
      db.query(`select completar_onboarding('es', $1::jsonb, '0')`, [JSON.stringify([bancoBbva])]),
    )).rejects.toThrow(/iniciar sesión/);
  });
});

describe('crear_banco', () => {
  it('crea un banco del catálogo con su nombre por defecto, saldo exacto y fecha de hoy', async () => {
    await onboarding('es', [bancoBbva], '0');
    const id = await crearBanco('sabadell', '', null, '2.000');
    const c = await una(
      db,
      `select nombre, entidad, saldo_inicial::text as saldo, fecha_inicial = hoy_usuario() as hoy, es_principal, orden
       from cuentas where id = $1`,
      [id],
    );
    expect(c).toEqual({ nombre: 'Banco Sabadell', entidad: 'sabadell', saldo: '2000.00', hoy: true, es_principal: false, orden: 3 });
  });

  it('un banco propio necesita nombre; con nombre usa su color', async () => {
    await expect(crearBanco(null, ' ', '#000000', '1')).rejects.toThrow(/nombre del banco/);
    const id = await crearBanco(null, 'Cooperativa', '#abcdef', '10,10');
    const c = await una(db, `select nombre, color, saldo_inicial::text as saldo, es_principal from cuentas where id = $1`, [id]);
    // Sin otra cuenta principal, la primera pasa a serlo.
    expect(c).toEqual({ nombre: 'Cooperativa', color: '#abcdef', saldo: '10.10', es_principal: true });
  });

  it('valida saldo y entidad, y respeta el límite de 5 bancos', async () => {
    await expect(crearBanco('bbva', null, null, '')).rejects.toThrow(/Saldo no válido/);
    await expect(crearBanco('bbva', null, null, null)).rejects.toThrow(/Saldo no válido/);
    await expect(crearBanco('n26', null, null, '1')).rejects.toThrow(/no reconocido/);
    for (const e of ['bbva', 'ing', 'revolut', 'openbank', 'unicaja']) await crearBanco(e, null, null, '0');
    await expect(crearBanco('bankinter', null, null, '0')).rejects.toThrow(/5 bancos abiertos/);
  });

  it('anon no puede usar el onboarding ni crear bancos', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select crear_banco('bbva', null, null, '1')`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select completar_onboarding('es', '[]'::jsonb, '0')`)).rejects.toThrow(/permission denied/);
    });
  });
});
