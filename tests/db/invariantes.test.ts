/**
 * Reglas que la base impone por sí misma (secciones 1, 2, 4, 6, 8 y 10 de
 * docs/reglas-financieras.md). Si una de estas falla, los números dejan de cuadrar.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  crearCategoria, crearCuenta, crearDb, crearUsuario, mov, patrimonio, resumen, todas, una, valorar, valorCuenta,
} from './helpers.js';

let db: PGlite;
let u: string;
let bbva: string;
let ocio: string;
let nomina: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  u = await crearUsuario(db);
  bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', fechaInicial: '2026-09-01' });
  ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
});

describe('categoría según el tipo', () => {
  it('un gasto o una devolución necesitan categoría de gasto; un ingreso, de ingreso', async () => {
    await expect(mov(db, u, { tipo: 'gasto', importe: '10', fecha: '2026-10-01', cuenta: bbva, categoria: nomina }))
      .rejects.toThrow('Un gasto necesita una categoría de gasto');
    await expect(mov(db, u, { tipo: 'devolucion', importe: '10', fecha: '2026-10-01', cuenta: bbva, categoria: nomina }))
      .rejects.toThrow('Una devolución necesita una categoría de gasto');
    await expect(mov(db, u, { tipo: 'ingreso', importe: '10', fecha: '2026-10-01', cuenta: bbva, categoria: ocio }))
      .rejects.toThrow('Un ingreso necesita una categoría de ingreso');
  });

  it('gastos, ingresos y devoluciones exigen categoría; traspasos y ajustes no la admiten', async () => {
    await expect(mov(db, u, { tipo: 'gasto', importe: '10', fecha: '2026-10-01', cuenta: bbva }))
      .rejects.toThrow(/categoria_segun_tipo/);
    await expect(mov(db, u, { tipo: 'ajuste', importe: '10', fecha: '2026-10-01', cuenta: bbva, sentido: 'suma', categoria: ocio }))
      .rejects.toThrow(/categoria_segun_tipo/);
  });
});

describe('traspasos', () => {
  it('necesitan una cuenta destino distinta de la de origen', async () => {
    await expect(mov(db, u, { tipo: 'traspaso', importe: '10', fecha: '2026-10-01', cuenta: bbva }))
      .rejects.toThrow(/traspaso_con_destino/);
    await expect(mov(db, u, { tipo: 'traspaso', importe: '10', fecha: '2026-10-01', cuenta: bbva, destino: bbva }))
      .rejects.toThrow(/traspaso_con_destino/);
  });

  it('sacar 50 € del cajero es un traspaso: no cambia balance ni patrimonio', async () => {
    const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', fechaInicial: '2026-09-01' });
    const antes = await patrimonio(db, '2026-10-01');
    await mov(db, u, { tipo: 'traspaso', importe: '50.00', fecha: '2026-10-01', cuenta: bbva, destino: efectivo });
    expect(await patrimonio(db, '2026-10-01')).toBe(antes);
    expect(await valorCuenta(db, efectivo, '2026-10-01')).toBe('50.00');
    expect((await resumen(db, '2026-10-01', '2026-10-31')).balance).toBe('0.00');
  });
});

describe('ajustes', () => {
  it('suman o restan en la cuenta según su sentido, cambian el patrimonio y no el balance', async () => {
    await mov(db, u, { tipo: 'ajuste', importe: '12.30', fecha: '2026-10-01', cuenta: bbva, sentido: 'resta' });
    await mov(db, u, { tipo: 'ajuste', importe: '2.30', fecha: '2026-10-02', cuenta: bbva, sentido: 'suma' });
    expect(await valorCuenta(db, bbva, '2026-10-02')).toBe('990.00');
    const r = await resumen(db, '2026-10-01', '2026-10-31');
    expect(r.balance).toBe('0.00');
    expect(r.ajustes).toBe('-10.00');
  });

  it('un ajuste sin sentido, o un sentido fuera de un ajuste, se rechaza', async () => {
    await expect(mov(db, u, { tipo: 'ajuste', importe: '1', fecha: '2026-10-01', cuenta: bbva }))
      .rejects.toThrow(/sentido_solo_en_ajuste/);
    await expect(mov(db, u, { tipo: 'gasto', importe: '1', fecha: '2026-10-01', cuenta: bbva, categoria: ocio, sentido: 'resta' }))
      .rejects.toThrow(/sentido_solo_en_ajuste/);
  });
});

describe('devoluciones vinculadas', () => {
  it('solo se vinculan a un gasto y no pueden superarlo', async () => {
    const cena = await mov(db, u, { tipo: 'gasto', importe: '80.00', fecha: '2026-10-01', cuenta: bbva, categoria: ocio });
    const sueldo = await mov(db, u, { tipo: 'ingreso', importe: '100.00', fecha: '2026-10-01', cuenta: bbva, categoria: nomina });

    await expect(mov(db, u, { tipo: 'devolucion', importe: '5', fecha: '2026-10-02', cuenta: bbva, categoria: ocio, devolucionDe: sueldo }))
      .rejects.toThrow('Solo se puede devolver un gasto');
    await mov(db, u, { tipo: 'devolucion', importe: '60.00', fecha: '2026-10-05', cuenta: bbva, categoria: ocio, devolucionDe: cena });
    await expect(mov(db, u, { tipo: 'devolucion', importe: '20.01', fecha: '2026-10-06', cuenta: bbva, categoria: ocio, devolucionDe: cena }))
      .rejects.toThrow('superan el gasto original');
  });

  it('el gasto original no puede bajar de lo ya devuelto', async () => {
    const cena = await mov(db, u, { tipo: 'gasto', importe: '80.00', fecha: '2026-10-01', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '60.00', fecha: '2026-10-05', cuenta: bbva, categoria: ocio, devolucionDe: cena });
    await expect(db.query(`update movimientos set importe = 50 where id = $1`, [cena])).rejects.toThrow('60.00 € devueltos');
    await db.query(`update movimientos set importe = 70 where id = $1`, [cena]);
  });

  it('una cena de 80 € pendiente de cobrar cuenta 80 € en su mes hasta que llega la devolución', async () => {
    const cena = await mov(db, u, { tipo: 'gasto', importe: '80.00', fecha: '2026-09-28', cuenta: bbva, categoria: ocio });
    await mov(db, u, { tipo: 'devolucion', importe: '60.00', fecha: '2026-10-03', cuenta: bbva, categoria: ocio, devolucionDe: cena });
    expect((await resumen(db, '2026-09-01', '2026-09-30')).gastos_netos).toBe('80.00');
    expect((await resumen(db, '2026-10-01', '2026-10-31')).gastos_netos).toBe('-60.00');
  });
});

describe('cuentas', () => {
  it('no se registran movimientos anteriores a la fecha de partida (ya están en el saldo inicial)', async () => {
    await expect(mov(db, u, { tipo: 'gasto', importe: '1', fecha: '2026-08-31', cuenta: bbva, categoria: ocio }))
      .rejects.toThrow('La cuenta BBVA empieza el 2026-09-01');
    expect(await valorCuenta(db, bbva, '2026-08-31')).toBeNull();
    expect(await valorCuenta(db, bbva, '2026-09-01')).toBe('1000.00');
  });

  it('un pasivo resta del patrimonio: gastar con la tarjeta sube la deuda y pagarla es un traspaso', async () => {
    const tarjeta = await crearCuenta(db, u, { nombre: 'Tarjeta', tipo: 'pasivo', saldoInicial: '200.00', fechaInicial: '2026-09-01' });
    expect(await patrimonio(db, '2026-09-30')).toBe('800.00');

    await mov(db, u, { tipo: 'gasto', importe: '50.00', fecha: '2026-10-01', cuenta: tarjeta, categoria: ocio });
    expect(await valorCuenta(db, tarjeta, '2026-10-01')).toBe('-250.00');

    await mov(db, u, { tipo: 'traspaso', importe: '250.00', fecha: '2026-10-05', cuenta: bbva, destino: tarjeta });
    expect(await valorCuenta(db, tarjeta, '2026-10-05')).toBe('0.00');
    expect(await patrimonio(db, '2026-10-05')).toBe('750.00');
  });

  it('una cuenta solo se cierra con valor 0; conserva su historia y no admite movimientos posteriores', async () => {
    const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: '40.00', fechaInicial: '2026-09-01' });
    await expect(db.query(`update cuentas set fecha_cierre = '2026-10-10' where id = $1`, [efectivo]))
      .rejects.toThrow('debe ser 0');

    await mov(db, u, { tipo: 'traspaso', importe: '40.00', fecha: '2026-10-10', cuenta: efectivo, destino: bbva });
    await db.query(`update cuentas set fecha_cierre = '2026-10-10' where id = $1`, [efectivo]);

    expect(await valorCuenta(db, efectivo, '2026-10-01')).toBe('40.00');
    expect(await valorCuenta(db, efectivo, '2026-11-01')).toBe('0.00');
    const { archivada } = await una<{ archivada: boolean }>(db, `select archivada from cuentas where id = $1`, [efectivo]);
    expect(archivada).toBe(true);
    await expect(mov(db, u, { tipo: 'gasto', importe: '1', fecha: '2026-10-11', cuenta: efectivo, categoria: ocio }))
      .rejects.toThrow('La cuenta Efectivo está cerrada');
  });

  it('una cuenta cerrada no admite cambios con fecha anterior al cierre: el dinero no puede desaparecer', async () => {
    const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', fechaInicial: '2026-09-01' });
    const retirada = await mov(db, u, { tipo: 'traspaso', importe: '20.00', fecha: '2026-10-01', cuenta: bbva, destino: efectivo });
    await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: '2026-10-02', cuenta: efectivo, categoria: ocio });
    await db.query(`update cuentas set fecha_cierre = '2026-10-10' where id = $1`, [efectivo]);

    await expect(mov(db, u, { tipo: 'gasto', importe: '5', fecha: '2026-10-05', cuenta: efectivo, categoria: ocio }))
      .rejects.toThrow('La cuenta Efectivo está cerrada');
    await expect(db.query(`delete from movimientos where id = $1`, [retirada])).rejects.toThrow('La cuenta Efectivo está cerrada');
    await expect(db.query(`update movimientos set importe = 30 where id = $1`, [retirada])).rejects.toThrow('La cuenta Efectivo está cerrada');

    // Reabrir, corregir y volver a cerrar sí está permitido
    await db.query(`update cuentas set fecha_cierre = null where id = $1`, [efectivo]);
    await mov(db, u, { tipo: 'ingreso', importe: '5', fecha: '2026-10-05', cuenta: efectivo, categoria: nomina });
    await expect(db.query(`update cuentas set fecha_cierre = '2026-10-10' where id = $1`, [efectivo])).rejects.toThrow('debe ser 0');
  });

  it('no se cierra una cuenta con movimientos posteriores a la fecha de cierre', async () => {
    const efectivo = await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', fechaInicial: '2026-09-01' });
    await mov(db, u, { tipo: 'traspaso', importe: '20.00', fecha: '2026-10-01', cuenta: bbva, destino: efectivo });
    await mov(db, u, { tipo: 'traspaso', importe: '20.00', fecha: '2026-10-01', cuenta: efectivo, destino: bbva });
    await mov(db, u, { tipo: 'traspaso', importe: '20.00', fecha: '2026-10-20', cuenta: bbva, destino: efectivo });
    await mov(db, u, { tipo: 'traspaso', importe: '20.00', fecha: '2026-10-21', cuenta: efectivo, destino: bbva });
    await expect(db.query(`update cuentas set fecha_cierre = '2026-10-10' where id = $1`, [efectivo]))
      .rejects.toThrow('tiene movimientos posteriores');
  });

  it('no se puede adelantar la fecha de partida por delante de sus movimientos', async () => {
    await mov(db, u, { tipo: 'gasto', importe: '5', fecha: '2026-09-10', cuenta: bbva, categoria: ocio });
    await expect(db.query(`update cuentas set fecha_inicial = '2026-09-15' where id = $1`, [bbva]))
      .rejects.toThrow('tiene datos anteriores');
  });
});

describe('valoraciones', () => {
  it('solo existen en cuentas de inversión', async () => {
    await expect(valorar(db, u, bbva, '2026-10-01', '1000')).rejects.toThrow('Solo las cuentas de inversión');
  });

  it('una por cuenta y día: anotar otra el mismo día la sustituye', async () => {
    const tr = await crearCuenta(db, u, { nombre: 'TR', tipo: 'inversion', fechaInicial: '2026-09-01' });
    await valorar(db, u, tr, '2026-10-15', '1590.00');
    await valorar(db, u, tr, '2026-10-15', '1600.00');
    const filas = await todas(db, `select valor::text from valoraciones where cuenta_id = $1`, [tr]);
    expect(filas).toEqual([{ valor: '1600.00' }]);
    expect(await valorCuenta(db, tr, '2026-10-15')).toBe('1600.00');
  });

  it('una valoración incluye los movimientos de su propio día; entre valoraciones el valor no se interpola', async () => {
    const tr = await crearCuenta(db, u, { nombre: 'TR', tipo: 'inversion', fechaInicial: '2026-09-01' });
    await valorar(db, u, tr, '2026-10-01', '1000.00');
    await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: '2026-10-15', cuenta: bbva, destino: tr });
    await valorar(db, u, tr, '2026-10-15', '1150.00');
    expect(await valorCuenta(db, tr, '2026-10-14')).toBe('1000.00');
    expect(await valorCuenta(db, tr, '2026-10-15')).toBe('1150.00');
  });

  it('un dividendo cobrado en la cuenta de inversión es ingreso (Rendimientos) y flujo, no revalorización', async () => {
    const tr = await crearCuenta(db, u, { nombre: 'TR', tipo: 'inversion', fechaInicial: '2026-09-01' });
    const rendimientos = await crearCategoria(db, u, 'Rendimientos', 'ingreso');
    await valorar(db, u, tr, '2026-09-30', '1000.00');
    await mov(db, u, { tipo: 'ingreso', importe: '3.20', fecha: '2026-10-01', cuenta: tr, categoria: rendimientos });
    expect((await resumen(db, '2026-10-01', '2026-10-31')).ingresos).toBe('3.20');
    const { v } = await una<{ v: string }>(db, `select revalorizacion($1, '2026-09-30', '2026-10-31')::text as v`, [tr]);
    expect(v).toBe('0.00');
  });
});

describe('vistas de gasto', () => {
  it('por método de pago suma solo gastos: las devoluciones no restan', async () => {
    await mov(db, u, { tipo: 'gasto', importe: '30.00', fecha: '2026-10-01', cuenta: bbva, categoria: ocio, metodo: 'tarjeta' });
    await mov(db, u, { tipo: 'gasto', importe: '12.50', fecha: '2026-10-02', cuenta: bbva, categoria: ocio, metodo: 'bizum' });
    await mov(db, u, { tipo: 'devolucion', importe: '10.00', fecha: '2026-10-03', cuenta: bbva, categoria: ocio, metodo: 'tarjeta' });
    const filas = await todas(db, `select metodo::text, gasto::text from gasto_por_metodo('2026-10-01', '2026-10-31') order by gasto desc`);
    expect(filas).toEqual([{ metodo: 'tarjeta', gasto: '30.00' }, { metodo: 'bizum', gasto: '12.50' }]);
  });

  it('el resumen mensual incluye los meses sin movimientos a cero', async () => {
    await mov(db, u, { tipo: 'gasto', importe: '9.91', fecha: '2026-10-05', cuenta: bbva, categoria: ocio });
    const filas = await todas(db, `select mes::text, gastos::text from resumen_mensual('2026-09-15', '2026-11-02')`);
    expect(filas).toEqual([
      { mes: '2026-09-01', gastos: '0.00' },
      { mes: '2026-10-01', gastos: '9.91' },
      { mes: '2026-11-01', gastos: '0.00' },
    ]);
  });
});

describe('fechas en Europe/Madrid', () => {
  it('el día de un instante es el de Madrid, no el de UTC', async () => {
    const casos: Array<[string, string]> = [
      ['2026-10-14T22:30:00Z', '2026-10-15'], // 00:30 en Madrid (verano, UTC+2)
      ['2026-12-31T23:30:00Z', '2027-01-01'], // 00:30 en Madrid (invierno, UTC+1)
      ['2026-10-15T21:59:59Z', '2026-10-15'], // 23:59:59 en Madrid: cierre del día
    ];
    for (const [instante, dia] of casos) {
      const { d } = await una<{ d: string }>(db, `select fecha_local($1::timestamptz)::text as d`, [instante]);
      expect(d, instante).toBe(dia);
    }
  });

  it('un movimiento sin fecha toma el día de hoy en la zona del usuario', async () => {
    const { id } = await una<{ id: string }>(
      db,
      `insert into movimientos (user_id, tipo, importe, cuenta_id, categoria_id, concepto)
       values ($1, 'gasto', 1, $2, $3, 'sin fecha') returning id`,
      [u, bbva, ocio],
    );
    const { igual } = await una<{ igual: boolean }>(
      db, `select fecha = fecha_local(now(), 'Europe/Madrid') as igual from movimientos where id = $1`, [id],
    );
    expect(igual).toBe(true);
  });

  it('una zona horaria inexistente en el perfil se rechaza', async () => {
    await expect(db.query(`update perfiles set zona_horaria = 'Europe/Narnia' where user_id = $1`, [u]))
      .rejects.toThrow(/time zone/);
  });
});
