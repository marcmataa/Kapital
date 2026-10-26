/**
 * 20261024000002_analisis_config.sql: variación patrimonial desde la fecha de
 * partida (secciones 4 y 5), datos nuevos del análisis (comparativa por
 * categoría, mayor gasto, fin de semana, cascada), corrección de los análisis
 * ya guardados, nombres traducidos de las categorías y el atajo con nombres
 * traducidos. Las cifras de septiembre son las de docs/reglas-financieras.md
 * (sección 3) con los saldos iniciales reales (1.013,42 €).
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACIONES, MIGRACION_ANALISIS_CONFIG, ROLLBACK_ANALISIS_CONFIG, actuarComo, conRol, crearCategoria, crearCuenta,
  crearDb, crearUsuario, mov, todas, una,
} from './helpers.js';
import { datosAnalisisSchema } from '../../supabase/functions/_shared/analisis/esquemas.ts';

let db: PGlite;
let u: string;
/** Mes cerrado que se analiza (el anterior al actual) y el de antes. 'YYYY-MM-01'. */
let mes: string;
let anterior: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  u = await crearUsuario(db);
  ({ mes, anterior } = await una<{ mes: string; anterior: string }>(
    db,
    `select to_char(m - interval '1 month', 'YYYY-MM-DD') as mes,
            to_char(m - interval '2 month', 'YYYY-MM-DD') as anterior
     from date_trunc('month', hoy_usuario()::timestamp) m`,
  ));
});

const dia = (m: string, n: number) => `${m.slice(0, 8)}${String(n).padStart(2, '0')}`;

async function datos(m: string): Promise<Record<string, unknown>> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () =>
    (await una<{ d: Record<string, unknown> }>(db, `select datos_analisis($1) as d`, [m])).d);
}

/** Primer día del mes `m` cuyo día ISO de la semana es `isodow` (6 = sábado). */
async function primerDia(m: string, isodow: number): Promise<string> {
  return (await una<{ d: string }>(
    db,
    `select min(d)::date::text as d from generate_series($1::date, $1::date + 6, interval '1 day') d
     where extract(isodow from d) = $2`,
    [m, isodow],
  )).d;
}

/**
 * Septiembre real: las cuentas empiezan el día 1 con 1.013,42 € entre las dos
 * (BBVA 913,42 € + Efectivo 100,00 €). Balance 339,72 € (sección 3).
 */
async function primerMesReal(m: string) {
  const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '913.42', fechaInicial: m, principal: true });
  const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: '100.00', fechaInicial: m });
  const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
  const otrosIngresos = await crearCategoria(db, u, 'Otros ingresos', 'ingreso');
  const restaurantes = await crearCategoria(db, u, 'Restaurantes', 'gasto');
  const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  await mov(db, u, { tipo: 'ingreso', importe: '1258.00', fecha: dia(m, 1), cuenta: bbva, categoria: nomina });
  await mov(db, u, { tipo: 'ingreso', importe: '250.00', fecha: dia(m, 15), cuenta: bbva, categoria: otrosIngresos });
  await mov(db, u, { tipo: 'gasto', importe: '1000.00', fecha: dia(m, 5), cuenta: bbva, categoria: restaurantes, metodo: 'tarjeta' });
  await mov(db, u, { tipo: 'gasto', importe: '198.28', fecha: dia(m, 20), cuenta: efectivo, categoria: ocio, metodo: 'efectivo' });
  await mov(db, u, { tipo: 'devolucion', importe: '30.00', fecha: dia(m, 21), cuenta: bbva, categoria: ocio });
  return { bbva, efectivo, restaurantes, ocio };
}

describe('variación patrimonial desde la fecha de partida (secciones 4 y 5)', () => {
  it('caso real: cuentas que empiezan el 1/9 con 1.013,42 € → la variación es +339,72 € (el balance), no +1.353,14 €', async () => {
    await primerMesReal('2026-09-01');
    await actuarComo(db, u);
    const v = await conRol(db, 'authenticated', () => una(
      db,
      `select patrimonio_inicial::text, patrimonio_final::text, balance::text, revalorizacion::text,
              ajustes::text, saldos_iniciales::text, variacion::text
       from variacion_patrimonial('2026-08-31', '2026-09-30')`,
    ));
    expect(v).toEqual({
      patrimonio_inicial: '1013.42',
      patrimonio_final: '1353.14',
      balance: '339.72',
      revalorizacion: '0.00',
      ajustes: '0.00',
      saldos_iniciales: '1013.42',
      variacion: '339.72',
    });
  });

  it('en datos_analisis el primer mes no cuenta los saldos iniciales como ganancia y no se compara con un mes anterior que no existe', async () => {
    await primerMesReal(mes);
    const d = await datos(mes);
    expect(d.mes_incompleto).toBe(false);
    expect(d.resumen_mes_anterior).toBeNull();
    expect(d.comparativa_categorias).toEqual([]);
    expect(d.variacion).toEqual({
      patrimonio_inicial: '1013.42', patrimonio_final: '1353.14', balance: '339.72', revalorizacion: '0.00',
      ajustes: '0.00', saldos_iniciales: '1013.42', variacion: '339.72', base: 'partida',
    });
  });

  it('una cuenta de inversión que empieza dentro del periodo parte de su saldo inicial: ni su saldo ni lo aportado es revalorización', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '500.00', fechaInicial: '2026-08-01' });
    const tr = await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion', saldoInicial: '1000.00', fechaInicial: '2026-09-10' });
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-09-12', cuenta: bbva, destino: tr });
    await db.query(`insert into valoraciones (user_id, cuenta_id, fecha, valor) values ($1, $2, '2026-09-30', 1127.44)`, [u, tr]);
    await actuarComo(db, u);
    const v = await conRol(db, 'authenticated', () => una<Record<string, string>>(
      db,
      `select patrimonio_inicial::text, patrimonio_final::text, balance::text, revalorizacion::text,
              saldos_iniciales::text, variacion::text, (balance + revalorizacion + ajustes)::text as suma
       from variacion_patrimonial('2026-08-31', '2026-09-30')`,
    ));
    expect(v).toMatchObject({
      patrimonio_inicial: '1500.00', patrimonio_final: '1527.44', balance: '0.00', revalorizacion: '27.44',
      saldos_iniciales: '1000.00', variacion: '27.44',
    });
    expect(v.suma).toBe(v.variacion);
  });

  it('un pasivo que empieza dentro del periodo resta del patrimonio de partida', async () => {
    await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '500.00', fechaInicial: '2026-08-01' });
    await crearCuenta(db, u, { nombre: 'Tarjeta', tipo: 'pasivo', saldoInicial: '200.00', fechaInicial: '2026-09-05' });
    await actuarComo(db, u);
    const v = await conRol(db, 'authenticated', () => una(
      db,
      `select patrimonio_inicial::text, saldos_iniciales::text, variacion::text
       from variacion_patrimonial('2026-08-31', '2026-09-30')`,
    ));
    expect(v).toEqual({ patrimonio_inicial: '300.00', saldos_iniciales: '-200.00', variacion: '0.00' });
  });
});

describe('datos_analisis: insights calculados en SQL', () => {
  async function dosMeses() {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '3000.00', fechaInicial: anterior, principal: true });
    const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
    const restaurantes = await crearCategoria(db, u, 'Restaurantes', 'gasto');
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    const transporte = await crearCategoria(db, u, 'Transporte', 'gasto');
    await mov(db, u, { tipo: 'ingreso', importe: '1500.00', fecha: dia(anterior, 1), cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'gasto', importe: '100.00', fecha: dia(anterior, 3), cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'gasto', importe: '80.00', fecha: dia(anterior, 4), cuenta: bbva, categoria: transporte });

    const sabado = await primerDia(mes, 6);
    const domingo = await primerDia(mes, 7);
    const lunes = await primerDia(mes, 1);
    await mov(db, u, { tipo: 'ingreso', importe: '1500.00', fecha: dia(mes, 1), cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'gasto', importe: '120.00', fecha: sabado, cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'gasto', importe: '30.00', fecha: lunes, cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '10.00', fecha: domingo, cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'gasto', importe: '400.00', fecha: lunes, cuenta: bbva, categoria: restaurantes, concepto: 'Cena privada' });
    await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: domingo, cuenta: bbva, categoria: transporte });
    return { sabado, lunes };
  }

  it('comparativa por categoría con el mes anterior, ordenada por lo que más cambia', async () => {
    await dosMeses();
    const d = await datos(mes);
    expect(d.comparativa_categorias).toEqual([
      { nombre: 'Restaurantes', clave: null, etiqueta: 'Restaurantes', gasto: '400.00', gasto_anterior: '0.00', diferencia: '400.00', variacion_pct: null },
      { nombre: 'Transporte', clave: null, etiqueta: 'Transporte', gasto: '20.00', gasto_anterior: '80.00', diferencia: '-60.00', variacion_pct: expect.stringMatching(/^-75.0+$/) },
      { nombre: 'Ocio', clave: null, etiqueta: 'Ocio', gasto: '140.00', gasto_anterior: '100.00', diferencia: '40.00', variacion_pct: expect.stringMatching(/^40.0+$/) },
    ]);
  });

  it('el mayor gasto del mes: importe, fecha, día de la semana y categoría, sin el concepto', async () => {
    const { lunes } = await dosMeses();
    const d = await datos(mes);
    expect(d.mayor_gasto).toMatchObject({
      importe: '400.00', fecha: lunes, dia_semana: '1', categoria: 'Restaurantes', etiqueta: 'Restaurantes',
    });
    // 400 / 570 de gastos (sin restar devoluciones) × 100.
    expect((d.mayor_gasto as { pct_gastos: string }).pct_gastos).toMatch(/^70\.1754385964/);
    expect(JSON.stringify(d)).not.toContain('Cena privada');
  });

  it('gasto en fin de semana: total neto, % sobre los gastos netos y por categoría', async () => {
    await dosMeses();
    const d = await datos(mes);
    const f = d.fin_de_semana as Record<string, unknown>;
    // Sábado 120 (ocio) + domingo 20 (transporte) − 10 de devolución de ocio = 130.
    expect(f.gasto_neto).toBe('130.00');
    // Gastos netos del mes: 570 − 10 = 560.
    expect(f.pct as string).toMatch(/^23\.2142857142/);
    expect(Number(f.dias)).toBeGreaterThanOrEqual(8);
    expect(f.categorias).toEqual([
      { nombre: 'Ocio', clave: null, etiqueta: 'Ocio', gasto_fin_de_semana: '110.00', gasto: '140.00', pct: expect.stringMatching(/^78\.571428/) },
      { nombre: 'Transporte', clave: null, etiqueta: 'Transporte', gasto_fin_de_semana: '20.00', gasto: '20.00', pct: expect.stringMatching(/^100\.0/) },
    ]);
  });

  it('cascada: ingresos → cada categoría → balance, con acumulados exactos', async () => {
    await dosMeses();
    const d = await datos(mes);
    expect(d.cascada).toEqual([
      { tipo: 'ingresos', nombre: null, clave: null, color: null, importe: '1500.00', inicio: '0.00', fin: '1500.00' },
      { tipo: 'categoria', nombre: 'Restaurantes', clave: null, color: '#8f9bbd', importe: '-400.00', inicio: '1500.00', fin: '1100.00' },
      { tipo: 'categoria', nombre: 'Ocio', clave: null, color: '#8f9bbd', importe: '-140.00', inicio: '1100.00', fin: '960.00' },
      { tipo: 'categoria', nombre: 'Transporte', clave: null, color: '#8f9bbd', importe: '-20.00', inicio: '960.00', fin: '940.00' },
      { tipo: 'balance', nombre: null, clave: null, color: null, importe: '940.00', inicio: '0.00', fin: '940.00' },
    ]);
    expect((d.resumen as { balance: string }).balance).toBe('940.00');
    // Contrato con la Edge Function: el snapshot completo pasa su esquema sin perder nada.
    const contrato = datosAnalisisSchema.parse(d);
    expect(contrato.cascada).toEqual(d.cascada);
    expect(contrato.comparativa_categorias).toEqual(d.comparativa_categorias);
    expect(contrato.mayor_gasto).toEqual(d.mayor_gasto);
    expect(contrato.fin_de_semana).toEqual(d.fin_de_semana);
  });

  it('cascada: más de 7 categorías se juntan en «otras» y una categoría en negativo sube', async () => {
    const r = await una<{ c: { tipo: string; importe: string; inicio: string; fin: string }[] }>(
      db,
      `select cascada_analisis(100.00, 63.00, $1::jsonb) as c`,
      [JSON.stringify([
        ...Array.from({ length: 9 }, (_, i) => ({ nombre: `C${i}`, clave: null, color: null, gasto: `${10 - i}.00` })),
        { nombre: 'Devuelta', clave: null, color: null, gasto: '-15.00' },
      ])],
    );
    const pasos = r.c;
    expect(pasos.map((p) => p.tipo)).toEqual([
      'ingresos', 'categoria', 'categoria', 'categoria', 'categoria', 'categoria', 'categoria', 'categoria', 'otras',
      'sin_categoria', 'balance',
    ]);
    // Las 7 primeras: 10+9+…+4 = 49; «otras» = 3 + 2 − 15 = −10 (sube).
    expect(pasos[8]).toMatchObject({ tipo: 'otras', importe: '10.00', inicio: '51.00', fin: '61.00' });
    // Sin categoría: 63 − (54 − 15) = 24.
    expect(pasos.at(-1)).toMatchObject({ tipo: 'balance', importe: '37.00', fin: '37.00' });
  });

  it('cascada sin categorías: solo ingresos, sin categoría y balance', async () => {
    const r = await una<{ c: unknown }>(db, `select cascada_analisis(0.00, 12.30, '[]'::jsonb) as c`);
    expect(r.c).toEqual([
      { tipo: 'ingresos', nombre: null, clave: null, color: null, importe: '0.00', inicio: '0.00', fin: '0.00' },
      { tipo: 'sin_categoria', nombre: null, clave: null, color: null, importe: '-12.30', inicio: '0.00', fin: '-12.30' },
      { tipo: 'balance', nombre: null, clave: null, color: null, importe: '-12.30', inicio: '0.00', fin: '-12.30' },
    ]);
  });

  it('las categorías por defecto llevan su clave y el nombre en el idioma del perfil', async () => {
    const email = `${u}@test.local`;
    await actuarComo(db, null);
    await db.query(`select preparar_usuario($1)`, [email]);
    await db.query(`update perfiles set idioma = 'en' where user_id = $1`, [u]);
    const bbva = (await una<{ id: string }>(db, `select id from cuentas where user_id = $1 and nombre = 'BBVA'`, [u])).id;
    await db.query(`update cuentas set fecha_inicial = $2 where id = $1`, [bbva, anterior]);
    const ocio = (await una<{ id: string }>(db, `select id from categorias where user_id = $1 and clave = 'ocio'`, [u])).id;
    await mov(db, u, { tipo: 'gasto', importe: '12.00', fecha: dia(mes, 2), cuenta: bbva, categoria: ocio });
    await db.query(`insert into objetivos (user_id, tipo, categoria_id, importe) values ($1, 'limite_categoria', $2, 50)`, [u, ocio]);
    const d = await datos(mes);
    expect(d.categorias).toEqual([{ nombre: 'Ocio', clave: 'ocio', etiqueta: 'Leisure', color: expect.any(String), gasto: '12.00' }]);
    expect(d.objetivos).toEqual([
      { tipo: 'limite_categoria', categoria: 'Ocio', clave: 'ocio', etiqueta: 'Leisure', importe: '50.00', actual: '12.00' },
    ]);
  });
});

describe('traduccion_categoria', () => {
  /** Lee 'categoria.<clave>': '<texto>' de las traducciones de la web, sin importarlas. */
  function textosWeb(idioma: 'es' | 'en' | 'ca'): Record<string, string> {
    const fuente = readFileSync(new URL(`../../apps/web/src/shared/i18n/common/${idioma}.ts`, import.meta.url), 'utf8');
    const textos: Record<string, string> = {};
    for (const m of fuente.matchAll(/'categoria\.([a-z_]+)':\s*'([^']+)'/g)) textos[m[1] as string] = m[2] as string;
    return textos;
  }

  it('usa exactamente los mismos nombres que la web en es, en y ca', async () => {
    for (const idioma of ['es', 'en', 'ca'] as const) {
      const web = textosWeb(idioma);
      expect(Object.keys(web)).toHaveLength(15);
      for (const [clave, texto] of Object.entries(web)) {
        const { t } = await una<{ t: string }>(db, `select traduccion_categoria($1, $2) as t`, [clave, idioma]);
        expect(t, `${idioma}.${clave}`).toBe(texto);
      }
    }
  });

  it('una clave o un idioma desconocidos dan NULL', async () => {
    expect((await una(db, `select traduccion_categoria('viajes', 'es') as t`)).t).toBeNull();
    expect((await una(db, `select traduccion_categoria('ocio', 'fr') as t`)).t).toBeNull();
  });
});

describe('atajo: categoría por nombre traducido o clave', () => {
  let token: string;
  beforeEach(async () => {
    const email = `${u}@test.local`;
    await actuarComo(db, null);
    ({ token } = await una<{ token: string }>(db, `select preparar_usuario($1) as token`, [email]));
  });

  async function gasto(categoria: string) {
    return conRol(db, 'anon', async () => (await una<{ r: { ok: boolean; id?: string; error?: string; mensaje?: string } }>(
      db,
      `select registrar_movimiento(token => $1, tipo => 'gasto', importe => '5', categoria => $2) as r`,
      [token, categoria],
    )).r);
  }
  const categoriaDe = async (id: string | undefined) =>
    (await una<{ n: string }>(db, `select c.nombre as n from movimientos m join categorias c on c.id = m.categoria_id where m.id = $1`, [id])).n;

  it('acepta el nombre en inglés o catalán, la clave y sin importar mayúsculas', async () => {
    for (const [texto, esperada] of [
      ['Leisure', 'Ocio'], ['oci', 'Ocio'], ['OTHER EXPENSES', 'Otros gastos'], ['altres despeses', 'Otros gastos'],
      ['otros_gastos', 'Otros gastos'], ['Restaurants', 'Restaurantes'], ['Subscripcions', 'Suscripciones'],
    ] as const) {
      const r = await gasto(texto);
      expect(r, texto).toMatchObject({ ok: true });
      expect(await categoriaDe(r.id)).toBe(esperada);
    }
  });

  it('un ingreso en inglés va a su categoría de ingreso', async () => {
    const r = await conRol(db, 'anon', async () => (await una<{ r: { ok: boolean; id?: string } }>(
      db, `select registrar_movimiento(token => $1, tipo => 'ingreso', importe => '1200', categoria => 'Salary') as r`, [token],
    )).r);
    expect(r.ok).toBe(true);
    expect(await categoriaDe(r.id)).toBe('Nómina');
  });

  it('una categoría renombrada por el usuario ya no se reconoce por la traducción (su clave se borró)', async () => {
    await db.query(`update categorias set nombre = 'Fiestas' where user_id = $1 and clave = 'ocio'`, [u]);
    expect(await gasto('Leisure')).toMatchObject({ ok: false, error: expect.stringMatching(/Categoría no encontrada: Leisure/) });
    expect((await gasto('Fiestas')).ok).toBe(true);
  });

  it('si el usuario tiene una categoría que se llama exactamente así, gana esa', async () => {
    await db.query(`insert into categorias (user_id, nombre, tipo) values ($1, 'Leisure', 'gasto')`, [u]);
    const r = await gasto('leisure');
    expect(await categoriaDe(r.id)).toBe('Leisure');
  });
});

describe('análisis ya guardados y rollback', () => {
  it('la migración corrige la variación de los análisis guardados y añade la cascada; el rollback lo deshace', async () => {
    const limpia = await crearDb({ hasta: MIGRACIONES.indexOf(MIGRACION_ANALISIS_CONFIG) });
    try {
      const usuario = randomUUID();
      await limpia.query(`insert into auth.users (id, email) values ($1, $2)`, [usuario, `${usuario}@test.local`]);
      const antiguo = {
        mes: '2026-09-01', mes_incompleto: false, idioma: 'es',
        resumen: { ingresos: '1508.00', gastos: '1198.28', devoluciones: '30.00', gastos_netos: '1168.28', balance: '339.72', ahorro_pct: '22.5', ajustes: '0.00' },
        resumen_mes_anterior: null,
        categorias: [{ nombre: 'Restaurantes', color: null, gasto: '1000.00' }, { nombre: 'Ocio', color: null, gasto: '168.28' }],
        categorias_mes_anterior: [], metodos: [], objetivos: [],
        variacion: {
          patrimonio_inicial: '0.00', patrimonio_final: '1353.14', balance: '339.72', revalorizacion: '0.00',
          ajustes: '0.00', saldos_iniciales: '1013.42', variacion: '1353.14',
        },
      };
      await limpia.query(
        `insert into analisis_mensuales (user_id, mes, estado, datos) values ($1, '2026-09-01', 'listo', $2::jsonb),
                                                                            ($1, '2026-08-01', 'error', null)`,
        [usuario, JSON.stringify(antiguo)],
      );

      await limpia.exec(MIGRACION_ANALISIS_CONFIG);
      const corregido = (await una<{ d: Record<string, unknown> }>(limpia, `select datos as d from analisis_mensuales where mes = '2026-09-01'`)).d;
      expect(corregido.variacion).toEqual({
        patrimonio_inicial: '1013.42', patrimonio_final: '1353.14', balance: '339.72', revalorizacion: '0.00',
        ajustes: '0.00', saldos_iniciales: '1013.42', variacion: '339.72', base: 'partida',
      });
      expect((corregido.cascada as { tipo: string; fin: string }[]).map((p) => [p.tipo, p.fin])).toEqual([
        ['ingresos', '1508.00'], ['categoria', '508.00'], ['categoria', '339.72'], ['balance', '339.72'],
      ]);
      expect((await una(limpia, `select datos as d from analisis_mensuales where mes = '2026-08-01'`)).d).toBeNull();

      await limpia.exec(ROLLBACK_ANALISIS_CONFIG);
      const revertido = (await una<{ d: Record<string, unknown> }>(limpia, `select datos as d from analisis_mensuales where mes = '2026-09-01'`)).d;
      expect(revertido).toEqual(antiguo);
      expect(await todas(limpia, `select proname from pg_proc where proname in ('cascada_analisis', 'traduccion_categoria')`)).toEqual([]);
    } finally {
      await limpia.close();
    }
  });
});
