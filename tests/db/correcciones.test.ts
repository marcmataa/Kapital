/**
 * Migración 20261020000000_correcciones.sql: hallazgos de las auditorías de
 * revisión y seguridad (usuarios anteriores al onboarding, comparativa sin mes
 * anterior completo, cuenta principal, agregados en el servidor, reintentos del
 * análisis y endurecimiento de permisos).
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_CORRECCIONES, ROLLBACK_CORRECCIONES, actuarComo, conRol, crearCategoria, crearCuenta, crearDb,
  crearUsuario, mov, todas, una,
} from './helpers.js';

let db: PGlite;
let u: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { u = await crearUsuario(db); });

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

const onboardingDe = async (base: PGlite, id: string) =>
  (await una<{ o: boolean }>(base, `select onboarding_completado as o from perfiles where user_id = $1`, [id])).o;

const bancoBbva = { entidad: 'bbva', nombre: '', color: null, saldo: '100' };

describe('usuarios creados antes del onboarding (H1)', () => {
  it('la migración marca el onboarding de quien ya tiene cuentas (preparar_usuario) y no el de quien no', async () => {
    const vieja = await crearDb({ hasta: 2 });
    try {
      await vieja.exec('update registro_config set abierto = true');
      const preparado = randomUUID();
      const nuevo = randomUUID();
      await vieja.query(`insert into auth.users (id, email) values ($1, 'preparado@test.local'), ($2, 'nuevo@test.local')`,
        [preparado, nuevo]);
      await vieja.query(`select preparar_usuario('preparado@test.local')`);
      expect(await onboardingDe(vieja, preparado)).toBe(false);

      await vieja.exec(MIGRACION_CORRECCIONES);
      expect(await onboardingDe(vieja, preparado)).toBe(true);
      expect(await onboardingDe(vieja, nuevo)).toBe(false);
    } finally {
      await vieja.close();
    }
  });

  it('preparar_usuario deja el onboarding completado', async () => {
    const id = randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@test.local`]);
    await db.query(`select preparar_usuario($1)`, [`${id}@test.local`]);
    expect(await onboardingDe(db, id)).toBe(true);
  });

  it('completar_onboarding con cuentas ya creadas falla con P0001 y no crea nada', async () => {
    await crearCuenta(db, u, { nombre: 'BBVA', principal: true });
    await expect(comoUsuario(`select completar_onboarding('es', $1::jsonb, '0')`, [JSON.stringify([bancoBbva])]))
      .rejects.toMatchObject({ code: 'P0001', message: 'El onboarding ya está completado' });
    expect((await una(db, `select count(*)::int as n from cuentas where user_id = $1`, [u])).n).toBe(1);
    expect((await una(db, `select count(*)::int as n from categorias where user_id = $1`, [u])).n).toBe(0);
  });

  it('un nombre repetido da el error del nombre (23505), no el de la cuenta principal', async () => {
    await expect(comoUsuario(`select completar_onboarding('es', $1::jsonb, '0')`,
      [JSON.stringify([{ entidad: null, nombre: 'Efectivo', color: null, saldo: '1' }])]))
      .rejects.toMatchObject({ code: '23505', message: 'Ya tienes una cuenta llamada «Efectivo»' });
  });
});

describe('datos_analisis sin mes anterior completo (H2, sección 8)', () => {
  let mes: string;
  let anterior: string;
  beforeEach(async () => {
    ({ mes, anterior } = await una<{ mes: string; anterior: string }>(
      db,
      `select to_char(m - interval '1 month', 'YYYY-MM-DD') as mes, to_char(m - interval '2 month', 'YYYY-MM-DD') as anterior
       from date_trunc('month', hoy_usuario()::timestamp) m`,
    ));
  });
  const dia = (m: string, n: number) => `${m.slice(0, 8)}${String(n).padStart(2, '0')}`;
  const datos = async (m: string) =>
    (await comoUsuario<{ d: Record<string, unknown> }>(`select datos_analisis($1) as d`, [m]))[0]?.d ?? {};

  it('si la cuenta más antigua empieza después del día 1 del mes anterior, no hay comparativa', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '100.00', fechaInicial: dia(anterior, 2) });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '10.00', fecha: dia(anterior, 3), cuenta: bbva, categoria: ocio });
    const d = await datos(mes);
    expect(d.resumen_mes_anterior).toBeNull();
    expect(d.categorias_mes_anterior).toEqual([]);
  });

  it('sin cuentas tampoco hay mes anterior', async () => {
    const d = await datos(mes);
    expect(d.resumen_mes_anterior).toBeNull();
    expect(d.categorias_mes_anterior).toEqual([]);
  });

  it('si empieza justo el día 1 del mes anterior, sí se compara', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '100.00', fechaInicial: anterior });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '10.00', fecha: dia(anterior, 3), cuenta: bbva, categoria: ocio });
    const d = await datos(mes);
    expect(d.resumen_mes_anterior).toMatchObject({ gastos: '10.00', gastos_netos: '10.00' });
    expect(d.categorias_mes_anterior).toEqual([{ nombre: 'Ocio', color: '#8f9bbd', gasto: '10.00' }]);
  });
});

describe('hacer_principal', () => {
  const hacer = (id: string) => comoUsuario(`select hacer_principal($1)`, [id]);
  const principales = async () =>
    (await todas<{ nombre: string }>(db, `select nombre from cuentas where user_id = $1 and es_principal order by nombre`, [u]))
      .map((f) => f.nombre);

  it('cambia la cuenta principal de forma atómica (y repetir no cambia nada)', async () => {
    await crearCuenta(db, u, { nombre: 'BBVA', principal: true });
    const ing = await crearCuenta(db, u, { nombre: 'ING' });
    await hacer(ing);
    expect(await principales()).toEqual(['ING']);
    await hacer(ing);
    expect(await principales()).toEqual(['ING']);
  });

  it('funciona aunque no hubiera ninguna principal', async () => {
    const ing = await crearCuenta(db, u, { nombre: 'ING' });
    await hacer(ing);
    expect(await principales()).toEqual(['ING']);
  });

  it('22023 si la cuenta no existe, es de otro usuario, está cerrada o no es un banco', async () => {
    await crearCuenta(db, u, { nombre: 'BBVA', principal: true });
    const otro = await crearUsuario(db);
    const ajena = await crearCuenta(db, otro, { nombre: 'Ajena' });
    const cerrada = await crearCuenta(db, u, { nombre: 'Cerrada' });
    await db.query(`update cuentas set fecha_cierre = '2026-02-01' where id = $1`, [cerrada]);
    const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo' });
    for (const id of [randomUUID(), ajena, cerrada, efectivo]) {
      await expect(hacer(id)).rejects.toMatchObject({ code: '22023' });
    }
    expect(await principales()).toEqual(['BBVA']);
    expect((await una(db, `select es_principal from cuentas where id = $1`, [ajena])).es_principal).toBe(false);
  });

  it('anon no puede ejecutarla', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select hacer_principal($1)`, [randomUUID()])).rejects.toThrow(/permission denied/);
    });
  });
});

describe('agregados en el servidor (gasto_por_dia, ingresos_por_categoria)', () => {
  beforeEach(async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00' });
    const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo' });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
    const rendimientos = await crearCategoria(db, u, 'Rendimientos', 'ingreso');
    await crearCategoria(db, u, 'Otros ingresos', 'ingreso');

    await mov(db, u, { tipo: 'gasto', importe: '10.10', fecha: '2026-03-01', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'gasto', importe: '0.20', fecha: '2026-03-01', cuenta: efectivo, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '5.00', fecha: '2026-03-02', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-03-03', cuenta: bbva, destino: efectivo });
    await mov(db, u, { tipo: 'ajuste', importe: '50.00', fecha: '2026-03-03', cuenta: bbva, sentido: 'resta' });
    await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: '2026-03-04', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '20.00', fecha: '2026-03-04', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'ingreso', importe: '1258.00', fecha: '2026-03-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'ingreso', importe: '0.10', fecha: '2026-03-31', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'ingreso', importe: '3.20', fecha: '2026-03-15', cuenta: bbva, categoria: rendimientos });
    // Fuera del periodo.
    await mov(db, u, { tipo: 'gasto', importe: '99.00', fecha: '2026-04-01', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'ingreso', importe: '99.00', fecha: '2026-02-28', cuenta: bbva, categoria: nomina });

    // Otro usuario con movimientos en las mismas fechas.
    const otro = await crearUsuario(db);
    const suya = await crearCuenta(db, otro, { nombre: 'BBVA' });
    const suOcio = await crearCategoria(db, otro, 'Ocio', 'gasto');
    const suNomina = await crearCategoria(db, otro, 'Nómina', 'ingreso');
    await mov(db, otro, { tipo: 'gasto', importe: '7.00', fecha: '2026-03-01', cuenta: suya, categoria: suOcio });
    await mov(db, otro, { tipo: 'ingreso', importe: '7.00', fecha: '2026-03-01', cuenta: suya, categoria: suNomina });
  });

  it('gasto_por_dia = Σ gastos − Σ devoluciones de cada día con movimientos; sin traspasos ni ajustes', async () => {
    const filas = await comoUsuario(
      `select fecha::text, gasto_neto::text from gasto_por_dia('2026-03-01', '2026-03-31') order by fecha`,
    );
    expect(filas).toEqual([
      { fecha: '2026-03-01', gasto_neto: '10.30' },
      { fecha: '2026-03-02', gasto_neto: '-5.00' },
      { fecha: '2026-03-04', gasto_neto: '0.00' },
    ]);
  });

  it('ingresos_por_categoria = Σ ingresos de cada categoría de ingreso del periodo', async () => {
    const filas = await comoUsuario(
      `select nombre, color, icono, ingreso::text from ingresos_por_categoria('2026-03-01', '2026-03-31')`,
    );
    expect(filas).toEqual([
      { nombre: 'Nómina', color: '#8f9bbd', icono: null, ingreso: '1258.10' },
      { nombre: 'Rendimientos', color: '#8f9bbd', icono: null, ingreso: '3.20' },
    ]);
  });

  it('anon no puede ejecutarlas', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select * from gasto_por_dia('2026-03-01', '2026-03-31')`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select * from ingresos_por_categoria('2026-03-01', '2026-03-31')`)).rejects.toThrow(/permission denied/);
    });
  });
});

describe('reintentar_analisis', () => {
  const MES = '2026-09-01';
  const insertar = (user: string, o: { estado: string; intentos?: number; regeneraciones?: number; haceMin?: number }) =>
    db.query(
      `insert into analisis_mensuales (user_id, mes, estado, intentos, regeneraciones, error_codigo, updated_at)
       values ($1, $2, $3, $4, $5, case when $3 = 'error' then 'openai_http' end, now() - make_interval(mins => $6))`,
      [user, MES, o.estado, o.intentos ?? 0, o.regeneraciones ?? 0, o.haceMin ?? 0],
    );
  const reintentar = () => comoUsuario(`select reintentar_analisis($1)`, [MES]);
  const fila = (user: string) => una(
    db, `select estado, intentos, regeneraciones, error_codigo from analisis_mensuales where user_id = $1 and mes = $2`, [user, MES],
  );
  const limite = { code: 'P0001', message: 'limite_reintentos' };
  const enCurso = { code: 'P0001', message: 'en_curso' };

  it('un análisis en error con intentos < 3 vuelve a pendiente sin gastar la regeneración', async () => {
    await insertar(u, { estado: 'error', intentos: 2, regeneraciones: 1 });
    await reintentar();
    expect(await fila(u)).toEqual({ estado: 'pendiente', intentos: 2, regeneraciones: 1, error_codigo: null });
  });

  it('en error con 3 intentos → limite_reintentos', async () => {
    await insertar(u, { estado: 'error', intentos: 3 });
    await expect(reintentar()).rejects.toMatchObject(limite);
  });

  it('pendiente o generando atascado (> 15 min) vuelve a pendiente', async () => {
    await insertar(u, { estado: 'generando', intentos: 1, haceMin: 20 });
    await reintentar();
    expect(await fila(u)).toMatchObject({ estado: 'pendiente', intentos: 1, regeneraciones: 0 });
  });

  it('pendiente o generando reciente → en_curso', async () => {
    await insertar(u, { estado: 'generando', intentos: 1, haceMin: 2 });
    await expect(reintentar()).rejects.toMatchObject(enCurso);
    const otro = await crearUsuario(db);
    u = otro;
    await insertar(u, { estado: 'pendiente', haceMin: 0 });
    await expect(reintentar()).rejects.toMatchObject(enCurso);
  });

  it('listo o inexistente → limite_reintentos (para rehacer un listo está solicitar_regeneracion)', async () => {
    await expect(reintentar()).rejects.toMatchObject(limite);
    await insertar(u, { estado: 'listo' });
    await expect(reintentar()).rejects.toMatchObject(limite);
  });

  it('solo toca la fila del usuario de la sesión', async () => {
    const otro = await crearUsuario(db);
    await insertar(otro, { estado: 'error', intentos: 1 });
    await expect(reintentar()).rejects.toMatchObject(limite);
    expect(await fila(otro)).toMatchObject({ estado: 'error' });
  });

  it('anon no puede ejecutarla', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select reintentar_analisis($1)`, [MES])).rejects.toThrow(/permission denied/);
    });
  });
});

describe('perfiles.onboarding_completado protegido', () => {
  it('el usuario no puede marcarlo ni desmarcarlo a mano, pero sí cambiar su idioma', async () => {
    await expect(comoUsuario(`update perfiles set onboarding_completado = true where user_id = $1`, [u]))
      .rejects.toMatchObject({ code: '42501' });
    await comoUsuario(`update perfiles set idioma = 'ca' where user_id = $1`, [u]);
    expect(await una(db, `select idioma, onboarding_completado from perfiles where user_id = $1`, [u]))
      .toEqual({ idioma: 'ca', onboarding_completado: false });
  });

  it('no puede borrar su perfil para recrearlo marcado', async () => {
    await expect(comoUsuario(`delete from perfiles where user_id = $1`, [u])).rejects.toThrow(/permission denied/);
  });

  it('completar_onboarding sí lo marca, y después el usuario no puede desmarcarlo', async () => {
    await comoUsuario(`select completar_onboarding('es', $1::jsonb, '0')`, [JSON.stringify([bancoBbva])]);
    expect(await onboardingDe(db, u)).toBe(true);
    await expect(comoUsuario(`update perfiles set onboarding_completado = false where user_id = $1`, [u]))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('el permiso de completar_onboarding no se filtra a otra sentencia de la misma transacción', async () => {
    await actuarComo(db, u);
    await expect(db.transaction(async (tx) => {
      await tx.exec('set local role authenticated');
      await tx.query(`select completar_onboarding('es', $1::jsonb, '0')`, [JSON.stringify([bancoBbva])]);
      await tx.query(`update perfiles set onboarding_completado = false where user_id = $1`, [u]);
    })).rejects.toMatchObject({ code: '42501' });
  });
});

describe('privilegios peligrosos', () => {
  it('anon y authenticated no tienen TRUNCATE, REFERENCES ni TRIGGER en ninguna tabla', async () => {
    const filas = await todas(
      db,
      `select table_name, grantee, privilege_type from information_schema.table_privileges
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
         and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')`,
    );
    expect(filas).toEqual([]);
  });

  it('tampoco en las tablas que se creen después', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec('create table tabla_futura (id int)');
      const filas = await todas(
        limpia,
        `select privilege_type from information_schema.table_privileges
         where table_name = 'tabla_futura' and grantee in ('anon', 'authenticated')
           and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')`,
      );
      expect(filas).toEqual([]);
    } finally {
      await limpia.close();
    }
  });
});

describe('tokens revocados', () => {
  it('un token revocado no se puede volver a activar', async () => {
    await comoUsuario(`select crear_token('iPad')`);
    await comoUsuario(`update tokens_api set revocado = true where nombre = 'iPad'`);
    await expect(comoUsuario(`update tokens_api set revocado = false where nombre = 'iPad'`))
      .rejects.toMatchObject({ code: '23514' });
    // Ni siquiera desde el SQL Editor.
    await expect(db.query(`update tokens_api set revocado = false where user_id = $1`, [u])).rejects.toThrow(/revocado/);
    // Cambiarle el nombre sí.
    await comoUsuario(`update tokens_api set nombre = 'iPad viejo' where nombre = 'iPad'`);
  });
});

describe('categoría Rendimientos', () => {
  it('no se puede renombrar, archivar ni cambiar de tipo; sí cambiar su color', async () => {
    await crearCategoria(db, u, 'Rendimientos', 'ingreso');
    for (const cambio of [`nombre = 'Intereses'`, `archivada = true`, `tipo = 'gasto'`]) {
      await expect(comoUsuario(`update categorias set ${cambio} where nombre = 'Rendimientos'`))
        .rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/Rendimientos/) });
    }
    await comoUsuario(`update categorias set color = '#000000' where nombre = 'Rendimientos'`);
    // Las demás categorías se renombran y archivan con normalidad.
    await crearCategoria(db, u, 'Nómina', 'ingreso');
    await comoUsuario(`update categorias set nombre = 'Sueldo', archivada = true where nombre = 'Nómina'`);
  });
});

describe('longitud del nombre de categoría', () => {
  it('máximo 40 caracteres (restricción validada)', async () => {
    await crearCategoria(db, u, 'x'.repeat(40), 'gasto');
    await expect(crearCategoria(db, u, 'y'.repeat(41), 'gasto')).rejects.toThrow(/check/);
    expect((await una(db, `select convalidated as v from pg_constraint where conname = 'categorias_nombre_longitud'`)).v)
      .toBe(true);
  });
});

describe('rollback de correcciones', () => {
  it('deshace solo esta migración, conserva el onboarding y se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec(ROLLBACK_CORRECCIONES);
      const nuevas = await todas(
        limpia,
        `select proname as n from pg_proc where pronamespace = 'public'::regnamespace
           and proname in ('hacer_principal', 'gasto_por_dia', 'ingresos_por_categoria', 'reintentar_analisis',
                           'proteger_onboarding', 'proteger_token_revocado', 'proteger_rendimientos')
         union all
         select conname from pg_constraint where conname = 'categorias_nombre_longitud'`,
      );
      expect(nuevas).toEqual([]);
      // La migración anterior sigue entera.
      expect((await una(limpia, `select count(*)::int as n from information_schema.columns
        where table_name = 'perfiles' and column_name = 'onboarding_completado'`)).n).toBe(1);
      // solicitar_regeneracion vuelve a admitir 'error'.
      const v = randomUUID();
      await limpia.query(`insert into auth.users (id, email) values ($1, $2)`, [v, `${v}@test.local`]);
      await limpia.query(`insert into analisis_mensuales (user_id, mes, estado) values ($1, '2026-09-01', 'error')`, [v]);
      await actuarComo(limpia, v);
      await conRol(limpia, 'authenticated', () => limpia.query(`select solicitar_regeneracion('2026-09-01')`));

      await limpia.exec(MIGRACION_CORRECCIONES);
      expect((await una(limpia, `select count(*)::int as n from pg_proc where proname = 'hacer_principal'`)).n).toBe(1);
    } finally {
      await limpia.close();
    }
  });
});
