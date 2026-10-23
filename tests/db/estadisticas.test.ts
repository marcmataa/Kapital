/**
 * Migración 20261023000002_estadisticas.sql: detalle por día (movimientos_por_dia) y
 * comparativa con gasto medio diario (comparativa_estadisticas). Datos inventados.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_ESTADISTICAS, ROLLBACK_ESTADISTICAS, actuarComo, conRol, crearCategoria, crearCuenta, crearDb, crearUsuario,
  mov, todas, una,
} from './helpers.js';

let db: PGlite;
let u: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

beforeEach(async () => {
  u = await crearUsuario(db);
  const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00' });
  const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo' });
  const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');

  // Marzo (tramo actual 1–4): 0,10 + 0,20 exactos; una devolución; traspaso y ajuste no cuentan.
  await mov(db, u, { tipo: 'gasto', importe: '0.10', fecha: '2026-03-01', cuenta: bbva, categoria: ocio, concepto: 'Chicle' });
  await mov(db, u, { tipo: 'gasto', importe: '0.20', fecha: '2026-03-01', cuenta: efectivo, categoria: ocio, concepto: 'Caramelo' });
  await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-03-01', cuenta: bbva, categoria: nomina, concepto: 'Nómina' });
  await mov(db, u, { tipo: 'gasto', importe: '30.00', fecha: '2026-03-02', cuenta: bbva, categoria: ocio, concepto: 'Cine' });
  await mov(db, u, { tipo: 'devolucion', importe: '10.00', fecha: '2026-03-02', cuenta: bbva, categoria: ocio, concepto: 'Ana - cine' });
  await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-03-03', cuenta: bbva, destino: efectivo });
  await mov(db, u, { tipo: 'ajuste', importe: '5.00', fecha: '2026-03-03', cuenta: bbva, sentido: 'resta' });
  await mov(db, u, { tipo: 'devolucion', importe: '4.00', fecha: '2026-03-04', cuenta: bbva, categoria: ocio, concepto: 'Bizum Leo' });
  // Fuera del tramo actual.
  await mov(db, u, { tipo: 'gasto', importe: '99.00', fecha: '2026-03-05', cuenta: bbva, categoria: ocio, concepto: 'Fuera' });
  // Febrero (tramo anterior 1–4).
  await mov(db, u, { tipo: 'gasto', importe: '40.00', fecha: '2026-02-03', cuenta: bbva, categoria: ocio, concepto: 'Cena' });
  await mov(db, u, { tipo: 'ingreso', importe: '800.00', fecha: '2026-02-01', cuenta: bbva, categoria: nomina, concepto: 'Nómina' });

  // Otro usuario con movimientos en las mismas fechas: nunca aparecen.
  const otro = await crearUsuario(db);
  const suya = await crearCuenta(db, otro, { nombre: 'BBVA' });
  const suOcio = await crearCategoria(db, otro, 'Ocio', 'gasto');
  await mov(db, otro, { tipo: 'gasto', importe: '500.00', fecha: '2026-03-01', cuenta: suya, categoria: suOcio, concepto: 'Ajeno' });
});

describe('movimientos_por_dia', () => {
  it('totales por día (sección 3) y lista de gastos, devoluciones e ingresos con el importe como texto', async () => {
    const filas = await comoUsuario<{ fecha: string; gastos: string; devoluciones: string; gasto_neto: string; ingresos: string; movimientos: unknown }>(
      `select fecha::text, gastos::text, devoluciones::text, gasto_neto::text, ingresos::text, movimientos
       from movimientos_por_dia('2026-03-01', '2026-03-04')`,
    );
    const sinId = filas.map((f) => ({
      ...f,
      movimientos: (f.movimientos as { id: string }[]).map(({ id: _id, ...resto }) => resto),
    }));
    expect(sinId).toEqual([
      {
        fecha: '2026-03-01', gastos: '0.30', devoluciones: '0.00', gasto_neto: '0.30', ingresos: '1000.00',
        movimientos: [
          { tipo: 'gasto', concepto: 'Chicle', importe: '0.10' },
          { tipo: 'gasto', concepto: 'Caramelo', importe: '0.20' },
          { tipo: 'ingreso', concepto: 'Nómina', importe: '1000.00' },
        ],
      },
      {
        fecha: '2026-03-02', gastos: '30.00', devoluciones: '10.00', gasto_neto: '20.00', ingresos: '0.00',
        movimientos: [
          { tipo: 'gasto', concepto: 'Cine', importe: '30.00' },
          { tipo: 'devolucion', concepto: 'Ana - cine', importe: '10.00' },
        ],
      },
      // Traspaso y ajuste (día 3) no entran. Una devolución sola deja el neto en negativo y no es ingreso.
      {
        fecha: '2026-03-04', gastos: '0.00', devoluciones: '4.00', gasto_neto: '-4.00', ingresos: '0.00',
        movimientos: [{ tipo: 'devolucion', concepto: 'Bizum Leo', importe: '4.00' }],
      },
    ]);
  });
});

describe('comparativa_estadisticas', () => {
  type Fila = {
    gastos_netos: string; gastos_netos_anterior: string | null; variacion_gastos: string | null;
    ingresos: string; ingresos_anterior: string | null; variacion_ingresos: string | null;
    dias: number; gasto_medio_diario: string; medio_mostrado: string; mayor_concepto: string | null; mayor_importe: string | null;
  };
  const consulta = `
    select gastos_netos::text, gastos_netos_anterior::text, round(variacion_gastos, 1)::text as variacion_gastos,
           ingresos::text, ingresos_anterior::text, round(variacion_ingresos, 1)::text as variacion_ingresos,
           dias, gasto_medio_diario::text, round(gasto_medio_diario, 2)::text as medio_mostrado,
           mayor_concepto, mayor_importe::text
    from comparativa_estadisticas($1, $2, $3, $4)`;

  it('1–4 marzo contra 1–4 febrero: gastos netos, ingresos, variaciones, gasto medio y mayor gasto', async () => {
    const [f] = await comoUsuario<Fila>(consulta, ['2026-03-01', '2026-03-04', '2026-02-01', '2026-02-04']);
    expect(f).toMatchObject({
      // 0,30 + 30,00 − 10,00 − 4,00 = 16,30 (las devoluciones restan del gasto).
      gastos_netos: '16.30', gastos_netos_anterior: '40.00', variacion_gastos: '-59.3',
      // Las devoluciones nunca suman a ingresos.
      ingresos: '1000.00', ingresos_anterior: '800.00', variacion_ingresos: '25.0',
      dias: 4, medio_mostrado: '4.08',
      mayor_concepto: 'Cine', mayor_importe: '30.00',
    });
    // Precisión completa: se redondea al mostrar.
    expect(f?.gasto_medio_diario.startsWith('4.075')).toBe(true);
  });

  it('sin tramo anterior no hay variación; con anterior a 0 tampoco («Sin datos del mes anterior»)', async () => {
    const [sin] = await comoUsuario<Fila>(consulta, ['2026-03-01', '2026-03-04', null, null]);
    expect(sin).toMatchObject({ gastos_netos_anterior: null, variacion_gastos: null, ingresos_anterior: null, variacion_ingresos: null });
    const [cero] = await comoUsuario<Fila>(consulta, ['2026-03-01', '2026-03-04', '2026-01-01', '2026-01-04']);
    expect(cero).toMatchObject({ gastos_netos_anterior: '0.00', variacion_gastos: null, ingresos_anterior: '0.00', variacion_ingresos: null });
  });

  it('mes cerrado: el gasto medio usa todos los días del mes; sin gastos no hay mayor', async () => {
    const [marzo] = await comoUsuario<Fila>(consulta, ['2026-03-01', '2026-03-31', '2026-02-01', '2026-02-28']);
    // (16,30 + 99,00) / 31 = 3,7193… → 3,72 €
    expect(marzo).toMatchObject({ gastos_netos: '115.30', dias: 31, medio_mostrado: '3.72', mayor_concepto: 'Fuera' });
    const [abril] = await comoUsuario<Fila>(consulta, ['2026-04-01', '2026-04-30', '2026-03-01', '2026-03-31']);
    expect(abril).toMatchObject({ gastos_netos: '0.00', dias: 30, medio_mostrado: '0.00', mayor_concepto: null, mayor_importe: null });
  });
});

describe('balance en la comparativa y lo que no cuenta en el balance', () => {
  it('sección 11: ingresos 1.508,00 € − gastos netos 1.168,28 € = 339,72 € frente a 229,60 € (+48,0 %)', async () => {
    u = await crearUsuario(db);
    const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '0' });
    const tr = await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion' });
    const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
    const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
    await mov(db, u, { tipo: 'ingreso', importe: '1508.00', fecha: '2026-09-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'gasto', importe: '1228.28', fecha: '2026-09-10', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '60.00', fecha: '2026-09-12', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'ingreso', importe: '1420.00', fecha: '2026-08-01', cuenta: bbva, categoria: nomina });
    await mov(db, u, { tipo: 'gasto', importe: '1190.40', fecha: '2026-08-10', cuenta: bbva, categoria: ocio });
    // Traspaso y ajuste del mismo mes: no cambian el balance.
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-09-15', cuenta: bbva, destino: tr });
    await mov(db, u, { tipo: 'ajuste', importe: '7.50', fecha: '2026-09-20', cuenta: bbva, sentido: 'suma' });

    const [f] = await comoUsuario<{ balance: string; balance_anterior: string; variacion: string }>(
      `select balance::text, balance_anterior::text, round(variacion_balance, 1)::text as variacion
       from comparativa_estadisticas('2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31')`,
    );
    expect(f).toEqual({ balance: '339.72', balance_anterior: '229.60', variacion: '48.0' });
  });

  it('fuera_del_balance: traspasos por par de cuentas y ajustes por cuenta y sentido', async () => {
    const filas = await comoUsuario(
      `select tipo::text, cuenta, cuenta_destino, sentido::text, importe::text
       from fuera_del_balance('2026-03-01', '2026-03-31')`,
    );
    expect(filas).toEqual([
      { tipo: 'traspaso', cuenta: 'BBVA', cuenta_destino: 'Efectivo', sentido: null, importe: '100.00' },
      { tipo: 'ajuste', cuenta: 'BBVA', cuenta_destino: null, sentido: 'resta', importe: '5.00' },
    ]);
    // El balance de marzo no los incluye: 1.000,00 − (0,30 + 30 + 99 − 10 − 4) = 884,70.
    const [c] = await comoUsuario<{ balance: string }>(
      `select balance::text from comparativa_estadisticas('2026-03-01', '2026-03-31', null, null)`,
    );
    expect(c?.balance).toBe('884.70');
  });
});

describe('permisos y rollback', () => {
  it('anon no puede ejecutarlas; authenticated sí', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select * from movimientos_por_dia('2026-03-01', '2026-03-31')`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select * from fuera_del_balance('2026-03-01', '2026-03-31')`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select * from comparativa_estadisticas('2026-03-01', '2026-03-31', null, null)`)).rejects.toThrow(/permission denied/);
    });
    expect(await comoUsuario(`select 1 from movimientos_por_dia('2026-03-01', '2026-03-31')`)).toHaveLength(4);
  });

  it('son security invoker con search_path fijo', async () => {
    const filas = await todas<{ fn: string; definer: boolean; config: string[] | null }>(
      db,
      `select proname as fn, prosecdef as definer, proconfig as config from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('movimientos_por_dia', 'comparativa_estadisticas', 'fuera_del_balance')
       order by proname`,
    );
    expect(filas.map((f) => [f.fn, f.definer])).toEqual([['comparativa_estadisticas', false], ['fuera_del_balance', false], ['movimientos_por_dia', false]]);
    for (const f of filas) expect(f.config, f.fn).toContain('search_path=public');
  });

  it('el down las borra y la migración se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      await limpia.exec(ROLLBACK_ESTADISTICAS);
      const contar = async () =>
        (await una<{ n: number }>(
          limpia,
          `select count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('movimientos_por_dia', 'comparativa_estadisticas', 'fuera_del_balance')`,
        )).n;
      expect(await contar()).toBe(0);
      await limpia.exec(MIGRACION_ESTADISTICAS);
      expect(await contar()).toBe(3);
    } finally {
      await limpia.close();
    }
  });
});
