/**
 * Casos de prueba de docs/reglas-financieras.md (sección 11) y ejemplo de la
 * sección 5. Usan las cifras reales del documento (excepción permitida en CLAUDE.md).
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  crearCategoria, crearCuenta, crearDb, crearUsuario, mov, patrimonio, resumen, todas, una, valorar, valorCuenta,
} from './helpers.js';

let db: PGlite;
let u: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { u = await crearUsuario(db); });

describe('Sección 11 · casos de prueba', () => {
  it('balance de septiembre: ingresos 1.508,00 € y gastos netos 1.168,28 € → balance 339,72 € y ahorro 22,5 %', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA' });
    const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
    const otrosIngresos = await crearCategoria(db, u, 'Otros ingresos', 'ingreso');
    const restaurantes = await crearCategoria(db, u, 'Restaurantes', 'gasto');
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');

    await mov(db, u, { tipo: 'ingreso', importe: '1258.00', fecha: '2026-09-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'ingreso', importe: '250.00', fecha: '2026-09-15', cuenta: bbva, categoria: otrosIngresos });
    await mov(db, u, { tipo: 'gasto', importe: '1000.00', fecha: '2026-09-05', cuenta: bbva, categoria: restaurantes });
    await mov(db, u, { tipo: 'gasto', importe: '198.28', fecha: '2026-09-20', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '30.00', fecha: '2026-09-21', cuenta: bbva, categoria: ocio });
    // Fuera de septiembre: no debe contar
    await mov(db, u, { tipo: 'gasto', importe: '99.99', fecha: '2026-10-01', cuenta: bbva, categoria: ocio });

    const r = await resumen(db, '2026-09-01', '2026-09-30');
    expect(r.ingresos).toBe('1508.00');
    expect(r.gastos_netos).toBe('1168.28');
    expect(r.balance).toBe('339.72');
    expect(r.ahorro_1d).toBe('22.5');

    const [septiembre] = await todas<{ mes: string; balance: string }>(
      db, `select mes::text, balance::text from resumen_mensual('2026-09-01', '2026-09-30')`,
    );
    expect(septiembre).toEqual({ mes: '2026-09-01', balance: '339.72' });
  });

  it('devoluciones de amigos: gasto de 100 € en Ocio + 4 devoluciones de 15 € → 40,00 € en Ocio, ingresos sin cambios', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA' });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    const entradas = await mov(db, u, { tipo: 'gasto', importe: '100.00', fecha: '2026-10-03', cuenta: bbva, categoria: ocio });
    for (let i = 0; i < 4; i++) {
      await mov(db, u, { tipo: 'devolucion', importe: '15.00', fecha: '2026-10-04', cuenta: bbva, categoria: ocio, devolucionDe: entradas, metodo: 'bizum' });
    }

    const { gasto } = await una<{ gasto: string }>(
      db, `select gasto::text from gasto_por_categoria('2026-10-01', '2026-10-31') where nombre = 'Ocio'`,
    );
    expect(gasto).toBe('40.00');
    const r = await resumen(db, '2026-10-01', '2026-10-31');
    expect(r.ingresos).toBe('0.00');
    expect(r.gastos_netos).toBe('40.00');
  });

  it('traspaso: 100 € de BBVA a Trade Republic no cambia balance ni patrimonio; BBVA −100 y Trade Republic +100', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', fechaInicial: '2026-09-01' });
    const tr = await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion', fechaInicial: '2026-09-01' });
    await valorar(db, u, tr, '2026-09-30', '1472.56');

    const antes = { r: await resumen(db, '2026-10-01', '2026-10-31'), p: await patrimonio(db, '2026-10-05') };
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-10-05', cuenta: bbva, destino: tr });

    expect(await resumen(db, '2026-10-01', '2026-10-31')).toEqual(antes.r);
    expect(await patrimonio(db, '2026-10-05')).toBe(antes.p);
    expect(await valorCuenta(db, bbva, '2026-10-05')).toBe('900.00');
    expect(await valorCuenta(db, tr, '2026-10-05')).toBe('1572.56');
  });

  describe('inversión: Trade Republic vale 1.472,56 € el 30/09, aportas 100 € el 05/10 y valoras 1.600,00 € el 15/10', () => {
    let tr: string;

    beforeEach(async () => {
      const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '2000.00', fechaInicial: '2026-09-01' });
      tr = await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion', fechaInicial: '2026-09-01' });
      await valorar(db, u, tr, '2026-09-30', '1472.56');
      await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-10-05', cuenta: bbva, destino: tr });
      await valorar(db, u, tr, '2026-10-15', '1600.00');
    });

    it('valor sin valoración nueva: 1.572,56 € el 10/10 (1.472,56 + 100 aportados)', async () => {
      expect(await valorCuenta(db, tr, '2026-10-10')).toBe('1572.56');
    });

    it('valor con valoración: 1.600,00 € el 15/10 y sigue en 1.600,00 € el 20/10', async () => {
      expect(await valorCuenta(db, tr, '2026-10-15')).toBe('1600.00');
      expect(await valorCuenta(db, tr, '2026-10-20')).toBe('1600.00');
    });

    it('revalorización del 30/09 al 15/10: +27,44 € y no aparece en el balance', async () => {
      const { v } = await una<{ v: string }>(db, `select revalorizacion($1, '2026-09-30', '2026-10-15')::text as v`, [tr]);
      expect(v).toBe('27.44');
      const r = await resumen(db, '2026-10-01', '2026-10-31');
      expect(r.balance).toBe('0.00');
      expect(r.ingresos).toBe('0.00');
    });
  });

  it('mes sin ingresos: el ahorro es NULL («—»), no un error ni infinito', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA' });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '15.00', fecha: '2026-11-02', cuenta: bbva, categoria: ocio });

    const r = await resumen(db, '2026-11-01', '2026-11-30');
    expect(r.ahorro_pct).toBeNull();
    expect(r.balance).toBe('-15.00');
  });

  it('fin de mes: 31/10 → 30/09; 29/03/2027 → 28/02/2027 (y el resto de la tabla de la sección 7)', async () => {
    const casos: Array<[string, string]> = [
      ['2026-10-15', '2026-09-15'],
      ['2026-10-31', '2026-09-30'],
      ['2027-03-29', '2027-02-28'],
      ['2027-03-30', '2027-02-28'],
      ['2027-03-31', '2027-02-28'],
      ['2028-03-30', '2028-02-29'], // año bisiesto
      ['2027-01-31', '2026-12-31'], // cruza de año
    ];
    for (const [dia, esperado] of casos) {
      const { d } = await una<{ d: string }>(db, `select dia_equivalente_mes_anterior($1)::text as d`, [dia]);
      expect(d, dia).toBe(esperado);
    }
  });

  it('día sin movimientos: el patrimonio es el del día anterior y la línea no baja a cero', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '500.00', fechaInicial: '2026-10-01' });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: '2026-10-03', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'gasto', importe: '30.00', fecha: '2026-10-08', cuenta: bbva, categoria: ocio });

    const serie = await todas<{ fecha: string; patrimonio: string }>(
      db, `select fecha::text, patrimonio::text from serie_patrimonio('2026-10-01', '2026-10-10', '2026-10-20')`,
    );
    expect(serie).toHaveLength(10);
    const porDia = Object.fromEntries(serie.map((p) => [p.fecha, p.patrimonio]));
    for (const dia of ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']) {
      expect(porDia[dia], dia).toBe('480.00');
    }
    expect(porDia['2026-10-09']).toBe('450.00');
    expect(serie.every((p) => p.patrimonio !== '0.00')).toBe(true);
  });

  it('hoy: el punto de hoy es provisional y no hay días futuros; antes de la fecha de partida no hay puntos', async () => {
    await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '100.00', fechaInicial: '2026-10-05' });

    const serie = await todas<{ fecha: string; provisional: boolean }>(
      db, `select fecha::text, provisional from serie_patrimonio('2026-10-01', '2026-10-31', '2026-10-20')`,
    );
    expect(serie[0]?.fecha).toBe('2026-10-05');
    expect(serie.at(-1)).toEqual({ fecha: '2026-10-20', provisional: true });
    expect(serie.filter((p) => p.provisional)).toHaveLength(1);
    expect(serie.some((p) => p.fecha > '2026-10-20')).toBe(false);
  });

  it('fecha real: un gasto apuntado el 20/10 con fecha 17/10 cuenta el 17/10 en la serie y en el balance', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '300.00', fechaInicial: '2026-10-01' });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '45.00', fecha: '2026-10-17', cuenta: bbva, categoria: ocio });

    expect(await patrimonio(db, '2026-10-16')).toBe('300.00');
    expect(await patrimonio(db, '2026-10-17')).toBe('255.00');
    expect((await resumen(db, '2026-10-17', '2026-10-17')).gastos).toBe('45.00');
    expect((await resumen(db, '2026-10-18', '2026-10-20')).gastos).toBe('0.00');
  });

  it('categoría en negativo: Otros gastos con 20 € de gasto y 50 € de devoluciones → −30,00 €', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA' });
    const otros = await crearCategoria(db, u, 'Otros gastos', 'gasto');
    await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: '2026-10-02', cuenta: bbva, categoria: otros });
    await mov(db, u, { tipo: 'devolucion', importe: '50.00', fecha: '2026-10-09', cuenta: bbva, categoria: otros });

    const { gasto } = await una<{ gasto: string }>(
      db, `select gasto::text from gasto_por_categoria('2026-10-01', '2026-10-31') where nombre = 'Otros gastos'`,
    );
    expect(gasto).toBe('-30.00');
  });

  it('porcentaje con base cero o sin datos → NULL («Sin datos del mes anterior»)', async () => {
    const casos: Array<[string | null, string | null, string | null]> = [
      ['100', '0', null],
      ['100', null, null],
      ['150', '100', '50.0'],
      ['50', '100', '-50.0'],
      ['-50', '-100', '50.0'], // se divide por |anterior|
    ];
    for (const [actual, anterior, esperado] of casos) {
      const { v } = await una<{ v: string | null }>(
        db, `select round(variacion_porcentual($1::numeric, $2::numeric), 1)::text as v`, [actual, anterior],
      );
      expect(v, `${actual} vs ${anterior}`).toBe(esperado);
    }
  });

  it('importes positivos: la base rechaza negativos y cero; «-24» llega al atajo como devolución de 24,00 €', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', principal: true });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    for (const importe of ['-24.00', '0', '0.00']) {
      await expect(mov(db, u, { tipo: 'gasto', importe, fecha: '2026-10-01', cuenta: bbva, categoria: ocio }), importe)
        .rejects.toThrow(/importe_check/);
    }

    const { token } = await una<{ token: string }>(db, `select crear_token('test') as token`);
    const { r } = await una<{ r: { ok: boolean; id: string } }>(
      db, `select registrar_movimiento($1, 'Devolución', '-24', 'Regalo', 'Ocio', 'bizum', '2026-10-02') as r`, [token],
    );
    expect(r.ok).toBe(true);
    const fila = await una(db, `select tipo::text, importe::text from movimientos where id = $1`, [r.id]);
    expect(fila).toEqual({ tipo: 'devolucion', importe: '24.00' });
  });
});

describe('Sección 5 · variación patrimonial', () => {
  it('mes con patrimonio inicial de 2.000,00 €: balance +300, traspaso 0, revalorización +27,44 → +327,44 € (final 2.327,44 €)', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '527.44', fechaInicial: '2026-09-30' });
    const tr = await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion', fechaInicial: '2026-09-30' });
    await valorar(db, u, tr, '2026-09-30', '1472.56');
    const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');

    await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-10-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-10-05', cuenta: bbva, destino: tr });
    await mov(db, u, { tipo: 'gasto', importe: '700.00', fecha: '2026-10-10', cuenta: bbva, categoria: ocio });
    await valorar(db, u, tr, '2026-10-31', '1600.00');

    const v = await una(
      db,
      `select patrimonio_inicial::text, patrimonio_final::text, balance::text, revalorizacion::text,
              ajustes::text, saldos_iniciales::text, variacion::text
       from variacion_patrimonial('2026-09-30', '2026-10-31')`,
    );
    expect(v).toEqual({
      patrimonio_inicial: '2000.00',
      patrimonio_final: '2327.44',
      balance: '300.00',
      revalorizacion: '27.44',
      ajustes: '0.00',
      saldos_iniciales: '0.00',
      variacion: '327.44',
    });
  });

  it('la variación siempre se explica: balance + revalorización + ajustes + saldos iniciales de cuentas nuevas', async () => {
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', fechaInicial: '2026-09-01' });
    const tr = await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion', fechaInicial: '2026-09-01' });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    await mov(db, u, { tipo: 'traspaso', importe: '400.00', fecha: '2026-10-02', cuenta: bbva, destino: tr });
    await valorar(db, u, tr, '2026-10-20', '380.00');                              // pierde 20 €
    await mov(db, u, { tipo: 'gasto', importe: '55.50', fecha: '2026-10-03', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'ajuste', importe: '4.50', fecha: '2026-10-25', cuenta: bbva, sentido: 'resta' });
    await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: '60.00', fechaInicial: '2026-10-10' });

    const v = await una<Record<string, string>>(
      db,
      `select balance::text, revalorizacion::text, ajustes::text, saldos_iniciales::text, variacion::text,
              (balance + revalorizacion + ajustes + saldos_iniciales)::text as suma
       from variacion_patrimonial('2026-09-30', '2026-10-31')`,
    );
    expect(v).toMatchObject({ balance: '-55.50', revalorizacion: '-20.00', ajustes: '-4.50', saldos_iniciales: '60.00' });
    expect(v.variacion).toBe('-20.00');
    expect(v.suma).toBe(v.variacion);
  });
});
