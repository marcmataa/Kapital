/**
 * Migración 20261102000001_devoluciones_vinculadas.sql: vínculo obligatorio, categoría heredada,
 * límite, fecha, gasto original que no se borra, atajo que rechaza devoluciones y candidatos
 * para el formulario (docs/reglas-financieras.md, secciones 3, 9, 10 y 11). Cifras inventadas.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_DEVOLUCIONES_VINCULADAS, ROLLBACK_DEVOLUCIONES_VINCULADAS, actuarComo, conRol, crearCategoria, crearCuenta,
  crearDb, crearUsuario, devolucionAntigua, mov, resumen, todas, una,
} from './helpers.js';

let db: PGlite;
let u: string;
let bbva: string;
let ocio: string;
let comida: string;
let nomina: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  u = await crearUsuario(db);
  bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', fechaInicial: '2024-01-01', principal: true });
  await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', fechaInicial: '2024-01-01' });
  ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  comida = await crearCategoria(db, u, 'Comida', 'gasto');
  nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
});

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated, como PostgREST). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

/** Gasto de `u` (por defecto en Ocio, BBVA). */
function gasto(importe: string, fecha: string, o: { concepto?: string; categoria?: string } = {}) {
  return mov(db, u, { tipo: 'gasto', importe, fecha, cuenta: bbva, categoria: o.categoria ?? ocio, metodo: 'tarjeta', concepto: o.concepto ?? 'Cena' });
}

/** Devolución vinculada a `gastoId`, desde la web (sin user_id; la categoría la pone la base). */
async function devolver(gastoId: string, importe: string, fecha: string, categoria: string | null = null): Promise<string> {
  const [fila] = await comoUsuario<{ id: string }>(
    `insert into movimientos (tipo, importe, fecha, cuenta_id, categoria_id, devolucion_de, concepto)
     values ('devolucion', $1, $2, $3, $4, $5, 'Bizum') returning id`,
    [importe, fecha, bbva, categoria, gastoId],
  );
  if (!fila) throw new Error('sin id');
  return fila.id;
}

const categoriaDe = async (id: string) =>
  (await una<{ categoria_id: string }>(db, `select categoria_id from movimientos where id = $1`, [id])).categoria_id;

describe('Sección 11 · devolución sin vínculo', () => {
  it('una devolución nueva de 10,00 € sin gasto original se rechaza desde la web y con un insert directo', async () => {
    await expect(comoUsuario(
      `insert into movimientos (tipo, importe, fecha, cuenta_id, categoria_id, concepto)
       values ('devolucion', 10, '2026-10-10', $1, $2, 'Bizum')`, [bbva, ocio],
    )).rejects.toThrow('Una devolución necesita el gasto original que devuelve');
    await expect(db.query(
      `insert into movimientos (user_id, tipo, importe, fecha, cuenta_id, categoria_id, concepto)
       values ($1, 'devolucion', 10, '2026-10-10', $2, $3, 'Bizum')`, [u, bbva, ocio],
    )).rejects.toMatchObject({ code: '23514' });
    expect(await todas(db, `select 1 from movimientos where user_id = $1`, [u])).toEqual([]);
  });

  it('el atajo rechaza las devoluciones y pide registrarlas desde el formulario de Kapital (sección 9)', async () => {
    await gasto('30.00', '2026-10-01');
    const { token } = await una<{ token: string }>(db, `select crear_token('test') as token`);
    await actuarComo(db, null);
    for (const tipo of ['Devolución', 'devolucion', 'reembolso']) {
      const r = await conRol(db, 'anon', async () => (await una<{ r: { ok: boolean; error: string } }>(
        db,
        `select registrar_movimiento(token => $1, tipo => $2, importe => '10', concepto => 'Bizum', categoria => 'Ocio') as r`,
        [token, tipo],
      )).r);
      expect(r, tipo).toEqual({
        ok: false,
        error: 'Las devoluciones se registran desde el formulario de Kapital, para vincularlas a su gasto original.',
      });
    }
    expect(await todas(db, `select 1 from movimientos where user_id = $1 and tipo = 'devolucion'`, [u])).toEqual([]);
    // El resto de tipos sigue entrando por el atajo.
    const r = await conRol(db, 'anon', async () => (await una<{ r: { ok: boolean } }>(
      db, `select registrar_movimiento(token => $1, tipo => 'gasto', importe => '5', categoria => 'Ocio') as r`, [token],
    )).r);
    expect(r.ok).toBe(true);
  });

  it('una devolución vinculada no puede quedarse sin vínculo al editarla', async () => {
    const cena = await gasto('30.00', '2026-10-01');
    const dev = await devolver(cena, '10.00', '2026-10-02');
    await expect(comoUsuario(`update movimientos set devolucion_de = null where id = $1`, [dev]))
      .rejects.toThrow('Vincula esta devolución a su gasto original antes de guardarla');
  });
});

describe('devoluciones antiguas sin vincular', () => {
  it('siguen existiendo y restando del gasto en su fecha y su categoría', async () => {
    await gasto('20.00', '2026-10-05');
    const antigua = await devolucionAntigua(db, u, { tipo: 'devolucion', importe: '50.00', fecha: '2026-10-09', cuenta: bbva, categoria: ocio });
    const r = await resumen(db, '2026-10-01', '2026-10-31');
    expect(r).toMatchObject({ gastos: '20.00', devoluciones: '50.00', gastos_netos: '-30.00', ingresos: '0.00' });
    expect(await una(db, `select devolucion_de, categoria_id from movimientos where id = $1`, [antigua]))
      .toEqual({ devolucion_de: null, categoria_id: ocio });
  });

  it('al editarla sin vincular se rechaza; vinculándola se acepta y hereda la categoría del gasto', async () => {
    const cena = await gasto('80.00', '2026-10-01', { categoria: comida });
    const antigua = await devolucionAntigua(db, u, { tipo: 'devolucion', importe: '20.00', fecha: '2026-10-03', cuenta: bbva, categoria: ocio });
    await expect(comoUsuario(`update movimientos set concepto = 'Bizum Ana' where id = $1`, [antigua]))
      .rejects.toThrow('Vincula esta devolución a su gasto original antes de guardarla');
    expect(await una(db, `select concepto from movimientos where id = $1`, [antigua])).toEqual({ concepto: 'devolucion de prueba' });

    await comoUsuario(`update movimientos set concepto = 'Bizum Ana', devolucion_de = $2 where id = $1`, [antigua, cena]);
    expect(await una(db, `select concepto, devolucion_de, categoria_id from movimientos where id = $1`, [antigua]))
      .toEqual({ concepto: 'Bizum Ana', devolucion_de: cena, categoria_id: comida });
  });
});

describe('Sección 11 · fecha de la devolución', () => {
  it('con un gasto del 10/10, una devolución del 09/10 se rechaza y una del 10/10 se acepta', async () => {
    const cena = await gasto('40.00', '2026-10-10');
    await expect(devolver(cena, '10.00', '2026-10-09'))
      .rejects.toThrow('La devolución (2026-10-09) no puede ser anterior a su gasto (2026-10-10)');
    const dev = await devolver(cena, '10.00', '2026-10-10');
    expect(await una(db, `select fecha::text from movimientos where id = $1`, [dev])).toEqual({ fecha: '2026-10-10' });
    // Al editarla tampoco puede pasar a antes de la compra.
    await expect(comoUsuario(`update movimientos set fecha = '2026-10-09' where id = $1`, [dev]))
      .rejects.toThrow(/no puede ser anterior a su gasto/);
  });

  it('un gasto con devoluciones no puede pasar a una fecha posterior a alguna de ellas', async () => {
    const cena = await gasto('40.00', '2026-10-10');
    await devolver(cena, '10.00', '2026-10-12');
    await devolver(cena, '5.00', '2026-10-15');
    await expect(comoUsuario(`update movimientos set fecha = '2026-10-13' where id = $1`, [cena]))
      .rejects.toThrow('Este gasto tiene devoluciones desde el 2026-10-12: su fecha no puede ser posterior');
    await comoUsuario(`update movimientos set fecha = '2026-10-12' where id = $1`, [cena]);
    await comoUsuario(`update movimientos set fecha = '2026-10-01' where id = $1`, [cena]);
    expect(await una(db, `select fecha::text from movimientos where id = $1`, [cena])).toEqual({ fecha: '2026-10-01' });
  });
});

describe('Sección 11 · devoluciones que superan el gasto', () => {
  it('gasto de 80,00 € y devolución de 60,00 €: otra de 20,01 € se rechaza y otra de 20,00 € se acepta', async () => {
    const cena = await gasto('80.00', '2026-10-01');
    await devolver(cena, '60.00', '2026-10-02');
    await expect(devolver(cena, '20.01', '2026-10-03'))
      .rejects.toThrow('Las devoluciones (80.01 €) superan el gasto original (80.00 €): quedan 20.00 € por devolver');
    await devolver(cena, '20.00', '2026-10-03');
    // Gasto neto 0,00 €, nunca negativo; no se puede vincular nada más a un gasto devuelto del todo.
    expect((await resumen(db, '2026-10-01', '2026-10-31')).gastos_netos).toBe('0.00');
    await expect(devolver(cena, '0.01', '2026-10-04')).rejects.toThrow('Este gasto ya está devuelto del todo (80.00 €)');
  });

  it('al editar, la propia devolución no cuenta contra sí misma, pero no puede superar lo pendiente', async () => {
    const cena = await gasto('80.00', '2026-10-01');
    const sesenta = await devolver(cena, '60.00', '2026-10-02');
    await devolver(cena, '15.00', '2026-10-03');
    await expect(comoUsuario(`update movimientos set importe = 65.01 where id = $1`, [sesenta]))
      .rejects.toThrow(/superan el gasto original/);
    await comoUsuario(`update movimientos set importe = 65.00 where id = $1`, [sesenta]);
    await comoUsuario(`update movimientos set importe = 50.00 where id = $1`, [sesenta]);
    expect(await una(db, `select importe::text from movimientos where id = $1`, [sesenta])).toEqual({ importe: '50.00' });
  });

  it('cambiar el vínculo a otro gasto respeta el límite del gasto nuevo', async () => {
    const cena = await gasto('80.00', '2026-10-01');
    const cine = await gasto('10.00', '2026-10-01', { concepto: 'Cine' });
    const dev = await devolver(cena, '20.00', '2026-10-02');
    await expect(comoUsuario(`update movimientos set devolucion_de = $2 where id = $1`, [dev, cine]))
      .rejects.toThrow(/superan el gasto original/);
  });
});

describe('Sección 11 · borrar el gasto original', () => {
  it('un gasto con una devolución vinculada no se puede borrar; al borrar antes la devolución, sí', async () => {
    const cena = await gasto('80.00', '2026-10-01');
    const dev = await devolver(cena, '25.00', '2026-10-02');
    await expect(comoUsuario(`delete from movimientos where id = $1`, [cena]))
      .rejects.toThrow('Este gasto tiene 1 devoluciones vinculadas que suman 25.00 €: no se puede borrar');
    // Tampoco con un borrado directo (sin RLS): la devolución nunca queda huérfana.
    await expect(db.query(`delete from movimientos where id = $1`, [cena])).rejects.toMatchObject({ code: '23514' });
    expect(await una(db, `select devolucion_de from movimientos where id = $1`, [dev])).toEqual({ devolucion_de: cena });

    await comoUsuario(`delete from movimientos where id = $1`, [dev]);
    await comoUsuario(`delete from movimientos where id = $1`, [cena]);
    expect(await todas(db, `select 1 from movimientos where user_id = $1`, [u])).toEqual([]);
  });

  it('el aviso cuenta todas las devoluciones y su suma', async () => {
    const entradas = await gasto('100.00', '2026-10-01');
    for (let i = 0; i < 4; i++) await devolver(entradas, '15.00', '2026-10-04');
    await expect(comoUsuario(`delete from movimientos where id = $1`, [entradas]))
      .rejects.toThrow('Este gasto tiene 4 devoluciones vinculadas que suman 60.00 €: no se puede borrar');
  });

  it('borrar el usuario sigue borrando todos sus datos, también gastos con devoluciones', async () => {
    const cena = await gasto('80.00', '2026-10-01');
    await devolver(cena, '25.00', '2026-10-02');
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(await todas(db, `select 1 from movimientos where user_id = $1`, [u])).toEqual([]);
  });
});

describe('categoría heredada', () => {
  it('se fuerza la categoría del gasto aunque el cliente envíe otra (o ninguna)', async () => {
    const cena = await gasto('80.00', '2026-10-01', { categoria: comida });
    expect(await categoriaDe(await devolver(cena, '10.00', '2026-10-02', ocio))).toBe(comida);
    expect(await categoriaDe(await devolver(cena, '10.00', '2026-10-02', nomina))).toBe(comida);
    expect(await categoriaDe(await devolver(cena, '10.00', '2026-10-02', null))).toBe(comida);
  });

  it('editar la categoría de la devolución no la cambia; cambiar la del gasto cambia la de sus devoluciones', async () => {
    const cena = await gasto('80.00', '2026-10-01', { categoria: comida });
    const a = await devolver(cena, '10.00', '2026-10-02');
    const b = await devolver(cena, '5.00', '2026-10-03');
    await comoUsuario(`update movimientos set categoria_id = $2 where id = $1`, [a, ocio]);
    expect(await categoriaDe(a)).toBe(comida);

    await comoUsuario(`update movimientos set categoria_id = $2 where id = $1`, [cena, ocio]);
    expect([await categoriaDe(a), await categoriaDe(b)]).toEqual([ocio, ocio]);
  });
});

describe('el vínculo solo apunta a un gasto propio', () => {
  it('no se puede vincular a un ingreso', async () => {
    const sueldo = await mov(db, u, { tipo: 'ingreso', importe: '1000.00', fecha: '2026-10-01', cuenta: bbva, categoria: nomina });
    await expect(devolver(sueldo, '5.00', '2026-10-02')).rejects.toThrow('Solo se puede devolver un gasto');
  });

  it('ni al gasto de otro usuario', async () => {
    const otro = await crearUsuario(db);
    const suya = await crearCuenta(db, otro, { nombre: 'BBVA', fechaInicial: '2024-01-01' });
    const suOcio = await crearCategoria(db, otro, 'Ocio', 'gasto');
    const ajeno = await mov(db, otro, { tipo: 'gasto', importe: '50.00', fecha: '2026-10-01', cuenta: suya, categoria: suOcio });
    await expect(devolver(ajeno, '5.00', '2026-10-02')).rejects.toThrow('Solo se puede devolver un gasto tuyo que exista');
    // Ni saltándose RLS.
    await expect(mov(db, u, { tipo: 'devolucion', importe: '5.00', fecha: '2026-10-02', cuenta: bbva, categoria: ocio, devolucionDe: ajeno }))
      .rejects.toMatchObject({ code: '23514' });
  });
});

describe('buscar_gastos_devolvibles', () => {
  type Candidato = { id: string; concepto: string; importe: string; pendiente: string; puntuacion: number; motivo: string };
  const COLUMNAS = 'id, concepto, importe::text, pendiente::text, puntuacion, motivo';
  let zara: string;
  let cena: string;
  let amazon: string;
  let mercadona: string;
  let ikea: string;

  beforeEach(async () => {
    ikea = await gasto('149.00', '2024-01-05', { concepto: 'IKEA estantería', categoria: comida });
    zara = await gasto('39.99', '2026-09-01', { concepto: 'Zara camiseta' });
    cena = await gasto('80.00', '2026-10-10', { concepto: 'Cena Ginos' });
    amazon = await gasto('24.50', '2026-10-15', { concepto: 'Pedido auriculares' });
    await db.query(`update movimientos set comercio = 'Amazon' where id = $1`, [amazon]);
    mercadona = await gasto('24.50', '2026-10-18', { concepto: 'Mercadona' });
  });

  it('ordena por concepto, importe y fecha, con el motivo como código', async () => {
    const filas = await comoUsuario<Candidato>(
      `select ${COLUMNAS} from buscar_gastos_devolvibles('Devolución AMAZON', '24,50', '2026-10-20')`,
    );
    // Amazon: comercio + importe exacto + 5 días = 50 + 35 + 8,75. Mercadona: importe exacto + 2 días.
    // Zara: 24,50 / 39,99 del importe; la cena, 24,50 / 80,00 y 10 días; IKEA, de 2024.
    expect(filas.map((f) => f.id)).toEqual([amazon, mercadona, zara, cena, ikea]);
    expect(filas[0]).toEqual({
      id: amazon, concepto: 'Pedido auriculares', importe: '24.50', pendiente: '24.50', puntuacion: 94, motivo: 'importe_exacto',
    });
    expect(filas.map((f) => f.motivo)).toEqual(['importe_exacto', 'importe_exacto', 'importe_parecido', 'reciente', 'reciente']);
  });

  it('el concepto se compara sin tildes ni mayúsculas', async () => {
    const [primero] = await comoUsuario<Candidato>(
      `select ${COLUMNAS} from buscar_gastos_devolvibles('Bizum ZÁRA', null, '2026-10-20')`,
    );
    expect(primero).toMatchObject({ id: zara, motivo: 'concepto_parecido' });
  });

  it('no ofrece gastos posteriores a la devolución ni gastos devueltos del todo', async () => {
    await devolver(zara, '39.99', '2026-09-05');
    const ids = (await comoUsuario<Candidato>(`select ${COLUMNAS} from buscar_gastos_devolvibles(p_fecha => '2026-10-12')`)).map((f) => f.id);
    expect(ids).toEqual([cena, ikea]);
  });

  it('el pendiente descuenta lo ya devuelto, y un importe mayor que lo pendiente no puntúa', async () => {
    await devolver(cena, '60.00', '2026-10-11');
    const [fila] = await comoUsuario<Candidato>(
      `select ${COLUMNAS} from buscar_gastos_devolvibles(null, '30', '2026-10-11') where id = $1`, [cena],
    );
    expect(fila).toMatchObject({ importe: '80.00', pendiente: '20.00', motivo: 'fecha_cercana' });
  });

  it('el buscador encuentra gastos antiguos por concepto o comercio, importe o fecha', async () => {
    const buscar = async (q: string) =>
      (await comoUsuario<Candidato>(`select ${COLUMNAS} from buscar_gastos_devolvibles(p_busqueda => $1, p_fecha => '2026-10-20')`, [q]))
        .map((f) => f.id);
    expect(await buscar('ikea')).toEqual([ikea]);
    expect(await buscar('estanteria')).toEqual([ikea]);
    expect(await buscar('amazon')).toEqual([amazon]);
    expect(await buscar('24,50')).toEqual([mercadona, amazon]);
    expect(await buscar('149')).toEqual([ikea]);
    expect(await buscar('2024-01-05')).toEqual([ikea]);
    expect(await buscar('05/01/2024')).toEqual([ikea]);
    expect(await buscar('1/9')).toEqual([zara]);
    expect(await buscar('nada parecido')).toEqual([]);
  });

  it('al editar una devolución, su gasto se ofrece con lo pendiente sin contarla', async () => {
    const dev = await devolver(cena, '80.00', '2026-10-11');
    expect((await comoUsuario<Candidato>(`select ${COLUMNAS} from buscar_gastos_devolvibles()`)).map((f) => f.id)).not.toContain(cena);
    const [fila] = await comoUsuario<Candidato>(
      `select ${COLUMNAS} from buscar_gastos_devolvibles(p_excluir => $1, p_fecha => '2026-10-11') where id = $2`, [dev, cena],
    );
    expect(fila).toMatchObject({ pendiente: '80.00' });
  });

  it('solo ve los gastos del usuario, respeta el límite y anon no puede llamarla', async () => {
    const otro = await crearUsuario(db);
    const suya = await crearCuenta(db, otro, { nombre: 'BBVA', fechaInicial: '2024-01-01' });
    const suOcio = await crearCategoria(db, otro, 'Ocio', 'gasto');
    await mov(db, otro, { tipo: 'gasto', importe: '24.50', fecha: '2026-10-19', cuenta: suya, categoria: suOcio, concepto: 'Amazon' });
    const filas = await comoUsuario<Candidato>(`select ${COLUMNAS} from buscar_gastos_devolvibles('Amazon', '24,50', '2026-10-20')`);
    expect(filas).toHaveLength(5);
    expect(await comoUsuario(`select id from buscar_gastos_devolvibles(p_limite => 2)`)).toHaveLength(2);
    await actuarComo(db, null);
    await expect(conRol(db, 'anon', () => db.query(`select * from buscar_gastos_devolvibles()`))).rejects.toThrow(/permission denied/);
  });
});

describe('rollback', () => {
  it('el down quita las reglas nuevas sin tocar los datos y la migración se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      const v = await crearUsuario(limpia);
      const cuenta = await crearCuenta(limpia, v, { nombre: 'BBVA' });
      const cat = await crearCategoria(limpia, v, 'Ocio', 'gasto');
      const cena = await mov(limpia, v, { tipo: 'gasto', importe: '80.00', fecha: '2026-10-01', cuenta, categoria: cat });
      const dev = await mov(limpia, v, { tipo: 'devolucion', importe: '20.00', fecha: '2026-10-02', cuenta, categoria: cat, devolucionDe: cena });

      await limpia.exec(ROLLBACK_DEVOLUCIONES_VINCULADAS);
      expect(await una(limpia, `select devolucion_de, importe::text from movimientos where id = $1`, [dev]))
        .toEqual({ devolucion_de: cena, importe: '20.00' });
      // Vuelve el comportamiento anterior: devolución sin vínculo y borrado que desvincula.
      await limpia.query(
        `insert into movimientos (user_id, tipo, importe, fecha, cuenta_id, categoria_id, concepto)
         values ($1, 'devolucion', 5, '2026-10-03', $2, $3, 'Sin vínculo')`, [v, cuenta, cat],
      );
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'gastos_devolvibles'`)).toHaveLength(1);
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'buscar_gastos_devolvibles'`)).toEqual([]);

      await limpia.exec(MIGRACION_DEVOLUCIONES_VINCULADAS);
      await expect(limpia.query(`delete from movimientos where id = $1`, [cena])).rejects.toThrow(/no se puede borrar/);
    } finally {
      await limpia.close();
    }
  });
});
