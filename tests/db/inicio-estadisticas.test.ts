/**
 * Migración 20261024000003_inicio_estadisticas.sql: objetivos con proyección (progreso_objetivos),
 * ritmo de gasto (ritmo_gasto) y peso de «Otros gastos» (peso_otros_gastos). Datos inventados,
 * salvo los casos de la sección 11 (devoluciones de amigos, categoría en negativo, fin de mes).
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_INICIO_ESTADISTICAS, ROLLBACK_INICIO_ESTADISTICAS, actuarComo, conRol, crearCategoria, crearCuenta, crearDb,
  crearUsuario, mov, todas, una,
} from './helpers.js';

let db: PGlite;
let u: string;
let bbva: string;
let efectivo: string;
let ocio: string;
let transporte: string;
let nomina: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

/** Categoría de gasto con clave (como las que crea el onboarding). */
async function categoriaConClave(userId: string, nombre: string, clave: string): Promise<string> {
  return (await una<{ id: string }>(
    db,
    `insert into categorias (user_id, nombre, tipo, clave) values ($1, $2, 'gasto', $3) returning id`,
    [userId, nombre, clave],
  )).id;
}

async function objetivo(userId: string, tipo: 'ahorro_mensual' | 'limite_categoria', importe: string, categoria: string | null = null, activo = true) {
  await db.query(
    `insert into objetivos (user_id, tipo, categoria_id, importe, activo) values ($1, $2, $3, $4, $5)`,
    [userId, tipo, categoria, importe, activo],
  );
}

beforeEach(async () => {
  u = await crearUsuario(db);
  bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00' });
  efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo' });
  ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  transporte = await crearCategoria(db, u, 'Transporte', 'gasto');
  nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
});

type FilaObjetivo = {
  tipo: string; importe: string; actual: string; exceso: string | null; restante: string | null;
  dias_restantes: number; diario: string | null;
};
const SELECT_OBJETIVOS = `select tipo::text, importe::text, actual::text, exceso::text, restante::text, dias_restantes,
                                 round(ahorro_diario_necesario, 2)::text as diario
                          from progreso_objetivos($1)`;

describe('progreso_objetivos', () => {
  beforeEach(async () => {
    // Octubre hasta el 23: nómina 1.000; Ocio = sección 11 (100 − 4 × 15 = 40); Transporte 600.
    await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-10-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'gasto', importe: '100.00', fecha: '2026-10-03', cuenta: bbva, categoria: ocio, concepto: 'Entradas' });
    for (let i = 0; i < 4; i++) {
      await mov(db, u, { tipo: 'devolucion', importe: '15.00', fecha: '2026-10-04', cuenta: bbva, categoria: ocio, concepto: 'Bizum' });
    }
    await mov(db, u, { tipo: 'gasto', importe: '600.00', fecha: '2026-10-10', cuenta: bbva, categoria: transporte });
    // Traspaso y ajuste no cuentan; un gasto posterior a hoy tampoco.
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-10-11', cuenta: bbva, destino: efectivo });
    await mov(db, u, { tipo: 'ajuste', importe: '50.00', fecha: '2026-10-12', cuenta: bbva, sentido: 'resta' });
    await mov(db, u, { tipo: 'gasto', importe: '999.00', fecha: '2026-10-25', cuenta: bbva, categoria: ocio });
    // Septiembre no entra en el mes en curso.
    await mov(db, u, { tipo: 'gasto', importe: '77.00', fecha: '2026-09-30', cuenta: bbva, categoria: ocio });
  });

  it('ahorro: falta importe − balance de 1..hoy, quedan los días del mes (hoy incluido) y el ahorro diario necesario', async () => {
    await objetivo(u, 'ahorro_mensual', '500.00');
    // Balance 1–23 oct = 1.000 − (40 + 600) = 360. Faltan 140 en 9 días (23..31) → 15,56 €/día.
    expect(await comoUsuario<FilaObjetivo>(SELECT_OBJETIVOS, ['2026-10-23'])).toEqual([
      { tipo: 'ahorro_mensual', importe: '500.00', actual: '360.00', exceso: null, restante: '140.00', dias_restantes: 9, diario: '15.56' },
    ]);
  });

  it('ahorro conseguido: sin restante ni proyección', async () => {
    await objetivo(u, 'ahorro_mensual', '300.00');
    const [fila] = await comoUsuario<FilaObjetivo>(SELECT_OBJETIVOS, ['2026-10-23']);
    expect(fila).toMatchObject({ actual: '360.00', restante: null, diario: null });
  });

  it('último día del mes: queda 1 día y se necesita todo lo que falta', async () => {
    await objetivo(u, 'ahorro_mensual', '500.00');
    // Al 31 entra el gasto del 25 (999): balance = 1.000 − 1.639 = −639. Faltan 1.139.
    const [fila] = await comoUsuario<FilaObjetivo>(SELECT_OBJETIVOS, ['2026-10-31']);
    expect(fila).toMatchObject({ actual: '-639.00', restante: '1139.00', dias_restantes: 1, diario: '1139.00' });
  });

  it('límite: gasto neto de su categoría (sección 11: 100 € − 4 × 15 € = 40 €) y cuánto se ha superado', async () => {
    await objetivo(u, 'limite_categoria', '30.00', ocio);
    await objetivo(u, 'limite_categoria', '700.00', transporte);
    const filas = await comoUsuario<FilaObjetivo>(SELECT_OBJETIVOS, ['2026-10-23']);
    expect(filas.map((f) => [f.actual, f.exceso, f.restante, f.diario])).toEqual([
      ['40.00', '10.00', null, null],
      ['600.00', null, null, null],
    ]);
  });

  it('límite de una categoría sin gastos este mes: 0,00 €', async () => {
    const vacia = await crearCategoria(db, u, 'Suscripciones', 'gasto');
    await objetivo(u, 'limite_categoria', '20.00', vacia);
    const [fila] = await comoUsuario<FilaObjetivo>(SELECT_OBJETIVOS, ['2026-10-23']);
    expect(fila).toMatchObject({ actual: '0.00', exceso: null });
  });

  it('solo objetivos activos y propios', async () => {
    await objetivo(u, 'ahorro_mensual', '500.00', null, false);
    const otro = await crearUsuario(db);
    await objetivo(otro, 'ahorro_mensual', '100.00');
    expect(await comoUsuario(SELECT_OBJETIVOS, ['2026-10-23'])).toEqual([]);
  });
});

type FilaRitmo = {
  devoluciones: string; medio: string; medio_ant: string | null; variacion: string | null; dias_mes: number;
  proyeccion: string | null;
};
const SELECT_RITMO = `select devoluciones::text, round(gasto_medio_diario, 2)::text as medio,
                             round(gasto_medio_diario_anterior, 2)::text as medio_ant,
                             round(variacion_medio_diario, 1)::text as variacion, dias_mes,
                             round(proyeccion_fin_mes, 2)::text as proyeccion
                      from ritmo_gasto($1, $2, $3, $4)`;

describe('ritmo_gasto', () => {
  beforeEach(async () => {
    // 1–10 oct: Ocio neto 40 (sección 11) + Transporte 60 = 100; devoluciones 60.
    await mov(db, u, { tipo: 'gasto', importe: '100.00', fecha: '2026-10-02', cuenta: bbva, categoria: ocio });
    for (let i = 0; i < 4; i++) {
      await mov(db, u, { tipo: 'devolucion', importe: '15.00', fecha: '2026-10-03', cuenta: bbva, categoria: ocio });
    }
    await mov(db, u, { tipo: 'gasto', importe: '60.00', fecha: '2026-10-10', cuenta: bbva, categoria: transporte });
    await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-10-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-10-05', cuenta: bbva, destino: efectivo });
    await mov(db, u, { tipo: 'ajuste', importe: '50.00', fecha: '2026-10-06', cuenta: bbva, sentido: 'resta' });
    await mov(db, u, { tipo: 'gasto', importe: '500.00', fecha: '2026-10-20', cuenta: bbva, categoria: ocio });
    // 1–10 sept: 50; septiembre completo: 1.168,28 (sección 3).
    await mov(db, u, { tipo: 'gasto', importe: '50.00', fecha: '2026-09-04', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'gasto', importe: '1118.28', fecha: '2026-09-20', cuenta: bbva, categoria: transporte });
  });

  it('mes en curso: medias de los dos tramos, su variación, devoluciones y proyección lineal a fin de mes', async () => {
    const filas = await comoUsuario<FilaRitmo>(SELECT_RITMO, ['2026-10-01', '2026-10-10', '2026-09-01', '2026-09-10']);
    // 100 / 10 = 10 €/día; 50 / 10 = 5 €/día (+100 %); 100 × 31 / 10 = 310.
    expect(filas).toEqual([
      { devoluciones: '60.00', medio: '10.00', medio_ant: '5.00', variacion: '100.0', dias_mes: 31, proyeccion: '310.00' },
    ]);
  });

  it('la proyección es exacta: multiplica antes de dividir', async () => {
    const [fila] = await comoUsuario<{ p: string }>(
      `select proyeccion_fin_mes::text as p from ritmo_gasto('2026-09-01', '2026-09-20')`,
    );
    // 1.168,28 × 30 / 20 = 1.752,42 exactos.
    expect(fila?.p).toMatch(/^1752\.420*$/);
  });

  it('mes cerrado: sin proyección; media de septiembre sobre sus 30 días', async () => {
    const [fila] = await comoUsuario<FilaRitmo>(SELECT_RITMO, ['2026-09-01', '2026-09-30', null, null]);
    // 1.168,28 / 30 = 38,94 €/día.
    expect(fila).toEqual({ devoluciones: '0.00', medio: '38.94', medio_ant: null, variacion: null, dias_mes: 30, proyeccion: null });
  });

  it('31 de octubre contra 30 de septiembre (sección 7): cada tramo con sus días, sin proyección', async () => {
    const [fila] = await comoUsuario<FilaRitmo>(SELECT_RITMO, ['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30']);
    // Octubre: 600 / 31 = 19,35; septiembre: 1.168,28 / 30 = 38,94.
    expect(fila).toMatchObject({ medio: '19.35', medio_ant: '38.94', proyeccion: null });
  });

  it('anterior con media 0: sin variación («Sin datos del mes anterior»)', async () => {
    const [fila] = await comoUsuario<FilaRitmo>(SELECT_RITMO, ['2026-10-01', '2026-10-10', '2026-08-01', '2026-08-10']);
    expect(fila).toMatchObject({ medio_ant: '0.00', variacion: null });
  });

  it('tramo vacío o al revés: ninguna fila', async () => {
    expect(await comoUsuario(SELECT_RITMO, ['2026-10-10', '2026-10-01', null, null])).toEqual([]);
  });
});

type FilaPeso = { gasto: string; porcentaje: string; supera_umbral: boolean };
const SELECT_PESO = `select gasto::text, round(porcentaje, 1)::text as porcentaje, supera_umbral
                     from peso_otros_gastos($1, $2)`;

describe('peso_otros_gastos', () => {
  let otros: string;
  beforeEach(async () => {
    otros = await categoriaConClave(u, 'Otros gastos', 'otros_gastos');
  });

  it('% sobre la suma de categorías positivas y aviso si supera el 20 %', async () => {
    await mov(db, u, { tipo: 'gasto', importe: '30.00', fecha: '2026-10-02', cuenta: bbva, categoria: otros });
    await mov(db, u, { tipo: 'gasto', importe: '40.00', fecha: '2026-10-02', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'gasto', importe: '50.00', fecha: '2026-10-02', cuenta: bbva, categoria: transporte });
    expect(await comoUsuario<FilaPeso>(SELECT_PESO, ['2026-10-01', '2026-10-31'])).toEqual([
      { gasto: '30.00', porcentaje: '25.0', supera_umbral: true },
    ]);
  });

  it('exactamente el 20 %: no supera', async () => {
    await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: '2026-10-02', cuenta: bbva, categoria: otros });
    await mov(db, u, { tipo: 'gasto', importe: '80.00', fecha: '2026-10-02', cuenta: bbva, categoria: ocio });
    const [fila] = await comoUsuario<FilaPeso>(SELECT_PESO, ['2026-10-01', '2026-10-31']);
    expect(fila).toEqual({ gasto: '20.00', porcentaje: '20.0', supera_umbral: false });
  });

  it('una categoría en negativo no entra en la base (sección 8, la del gráfico circular)', async () => {
    await mov(db, u, { tipo: 'gasto', importe: '30.00', fecha: '2026-10-02', cuenta: bbva, categoria: otros });
    await mov(db, u, { tipo: 'gasto', importe: '100.00', fecha: '2026-10-02', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '10.00', fecha: '2026-10-03', cuenta: bbva, categoria: transporte });
    // Base 130 (no 120): 30 / 130 = 23,1 %.
    const [fila] = await comoUsuario<FilaPeso>(SELECT_PESO, ['2026-10-01', '2026-10-31']);
    expect(fila).toEqual({ gasto: '30.00', porcentaje: '23.1', supera_umbral: true });
  });

  it('sección 11: Otros gastos en negativo (20 € − 50 €) no avisa', async () => {
    await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: '2026-10-02', cuenta: bbva, categoria: otros });
    await mov(db, u, { tipo: 'devolucion', importe: '50.00', fecha: '2026-10-03', cuenta: bbva, categoria: otros });
    await mov(db, u, { tipo: 'gasto', importe: '10.00', fecha: '2026-10-02', cuenta: bbva, categoria: ocio });
    expect(await comoUsuario(SELECT_PESO, ['2026-10-01', '2026-10-31'])).toEqual([]);
  });

  it('una «Otros gastos» creada por el usuario (sin clave) y la de otro usuario no cuentan', async () => {
    const mia = await crearCategoria(db, u, 'Otros', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '90.00', fecha: '2026-10-02', cuenta: bbva, categoria: mia });
    await mov(db, u, { tipo: 'gasto', importe: '10.00', fecha: '2026-10-02', cuenta: bbva, categoria: ocio });
    const otro = await crearUsuario(db);
    const suCuenta = await crearCuenta(db, otro, { nombre: 'BBVA' });
    const suyos = await categoriaConClave(otro, 'Otros gastos', 'otros_gastos');
    await mov(db, otro, { tipo: 'gasto', importe: '500.00', fecha: '2026-10-02', cuenta: suCuenta, categoria: suyos });
    expect(await comoUsuario(SELECT_PESO, ['2026-10-01', '2026-10-31'])).toEqual([]);
  });
});

describe('Suscripciones a 0,00 € el mes anterior (revisión)', () => {
  it('es dato real: el tramo anterior del mes en curso es 1..d′, y un cargo posterior a d′ no entra', async () => {
    const suscripciones = await crearCategoria(db, u, 'Suscripciones', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '12.99', fecha: '2026-09-25', cuenta: bbva, categoria: suscripciones });
    await mov(db, u, { tipo: 'gasto', importe: '12.99', fecha: '2026-10-05', cuenta: bbva, categoria: suscripciones });
    const tramo = (desde: string, hasta: string) =>
      comoUsuario<{ gasto: string }>(
        `select gasto::text from gasto_por_categoria($1, $2) where categoria_id = $3`, [desde, hasta, suscripciones],
      );
    // Hoy 19/10: 1–19 oct contra 1–19 sept → septiembre no tiene fila (la UI muestra 0,00 €).
    expect(await tramo('2026-10-01', '2026-10-19')).toEqual([{ gasto: '12.99' }]);
    expect(await tramo('2026-09-01', '2026-09-19')).toEqual([]);
    // Septiembre completo sí lo tiene.
    expect(await tramo('2026-09-01', '2026-09-30')).toEqual([{ gasto: '12.99' }]);
  });
});

describe('inicio_estadisticas · permisos y rollback', () => {
  const FUNCIONES = ['peso_otros_gastos', 'progreso_objetivos', 'ritmo_gasto'];

  it('security invoker con search_path; solo authenticated puede ejecutarlas', async () => {
    const filas = await todas<{ fn: string; definer: boolean; config: string[] | null; anon: boolean; auth: boolean; pub: boolean }>(
      db,
      `select proname as fn, prosecdef as definer, proconfig as config,
              has_function_privilege('anon', oid, 'execute') as anon,
              has_function_privilege('authenticated', oid, 'execute') as auth,
              exists (select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as pub
       from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1) order by proname`,
      [FUNCIONES],
    );
    expect(filas.map((f) => [f.fn, f.definer, f.anon, f.auth, f.pub])).toEqual(
      FUNCIONES.map((fn) => [fn, false, false, true, false]),
    );
    for (const f of filas) expect(f.config, f.fn).toContain('search_path=public');
  });

  it('el down las borra y la migración se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      const contar = async () =>
        (await una<{ n: number }>(
          limpia,
          `select count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1)`,
          [FUNCIONES],
        )).n;
      expect(await contar()).toBe(3);
      await limpia.exec(ROLLBACK_INICIO_ESTADISTICAS);
      expect(await contar()).toBe(0);
      await limpia.exec(MIGRACION_INICIO_ESTADISTICAS);
      expect(await contar()).toBe(3);
    } finally {
      await limpia.close();
    }
  });
});
