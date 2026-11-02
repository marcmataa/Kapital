/**
 * Migración 20261102000000_eliminar_categorias.sql: Hogar, Salud, Cuidado personal y Regalos
 * desaparecen; sus movimientos pasan a «Otros gastos» del mismo usuario sin que cambie ningún
 * total del mes; respaldo fuera de la API; aborta si hay objetivos o falta «Otros gastos»;
 * usuarios nuevos sin esas categorías; rollback exacto desde el respaldo.
 * Datos inventados.
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_POR_DEFECTO, CATEGORIAS_POR_DEFECTO_ANTERIORES, CLAVES_ELIMINADAS, MIGRACIONES, MIGRACION_ELIMINAR_CATEGORIAS,
  ROLLBACK_ELIMINAR_CATEGORIAS, actuarComo, conRol, crearCuenta, crearDb, mov, todas, una,
} from './helpers.js';

/** Base con todas las migraciones anteriores a esta. */
const ANTERIORES = MIGRACIONES.indexOf(MIGRACION_ELIMINAR_CATEGORIAS);

const RESPALDOS = ['respaldo_20261102_categorias', 'respaldo_20261102_movimientos_categoria'];

/** Usuario con las 15 categorías por defecto de antes (preparar_usuario). */
async function prepararUsuario(base: PGlite): Promise<string> {
  const id = randomUUID();
  await base.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@test.local`]);
  await base.query(`select preparar_usuario($1)`, [`${id}@test.local`]);
  return id;
}

async function categoria(base: PGlite, user: string, clave: string): Promise<string> {
  return (await una<{ id: string }>(base, `select id from categorias where user_id = $1 and clave = $2`, [user, clave])).id;
}

interface Escenario {
  user: string;
  banco: string;
  cartera: string;
  /** Movimientos en las categorías eliminadas, con su categoría original. */
  movidos: Record<string, string>;
}

/**
 * Gastos y devoluciones (vinculadas y sueltas) repartidos entre las 4 categorías, Ocio y Otros
 * gastos en septiembre y octubre, más ingresos, un traspaso, un ajuste y una cuenta cerrada con un
 * gasto de Hogar.
 */
async function escenario(base: PGlite): Promise<Escenario> {
  const user = await prepararUsuario(base);
  const banco = await crearCuenta(base, user, { nombre: 'Banco de prueba', saldoInicial: '1000.00' });
  const cartera = await crearCuenta(base, user, { nombre: 'Cartera', tipo: 'efectivo' });
  const c = {
    hogar: await categoria(base, user, 'hogar'),
    salud: await categoria(base, user, 'salud'),
    cuidado: await categoria(base, user, 'cuidado_personal'),
    regalos: await categoria(base, user, 'regalos'),
    ocio: await categoria(base, user, 'ocio'),
    otros: await categoria(base, user, 'otros_gastos'),
    nomina: await categoria(base, user, 'nomina'),
  };
  const movidos: Record<string, string> = {};
  const gasto = async (cat: string, importe: string, fecha: string, cuenta = banco) => {
    const id = await mov(base, user, { tipo: 'gasto', importe, fecha, cuenta, categoria: cat, metodo: 'tarjeta' });
    if (![c.ocio, c.otros].includes(cat)) movidos[id] = cat;
    return id;
  };
  const devolucion = async (cat: string, importe: string, fecha: string, devolucionDe?: string) => {
    const id = await mov(base, user, {
      tipo: 'devolucion', importe, fecha, cuenta: banco, categoria: cat, ...(devolucionDe ? { devolucionDe } : {}),
    });
    if (![c.ocio, c.otros].includes(cat)) movidos[id] = cat;
    return id;
  };

  await mov(base, user, { tipo: 'ingreso', importe: '1500.00', fecha: '2026-09-01', cuenta: banco, categoria: c.nomina });
  await gasto(c.hogar, '40.10', '2026-09-03');
  await gasto(c.salud, '25.50', '2026-09-05');
  await gasto(c.cuidado, '12.30', '2026-09-07');
  const regalo = await gasto(c.regalos, '60.00', '2026-09-10');
  await devolucion(c.regalos, '20.00', '2026-09-12', regalo);
  await devolucion(c.salud, '5.25', '2026-09-20');
  await gasto(c.otros, '9.99', '2026-09-21');
  await gasto(c.ocio, '30.00', '2026-09-22');

  await mov(base, user, { tipo: 'ingreso', importe: '1500.00', fecha: '2026-10-01', cuenta: banco, categoria: c.nomina });
  await gasto(c.hogar, '100.00', '2026-10-02');
  // Devolución en octubre de un gasto de septiembre.
  await devolucion(c.hogar, '40.10', '2026-10-03');
  await gasto(c.cuidado, '0.10', '2026-10-04');
  await gasto(c.cuidado, '0.20', '2026-10-04');
  await gasto(c.otros, '15.00', '2026-10-05');
  await mov(base, user, { tipo: 'ajuste', importe: '3.00', fecha: '2026-10-06', cuenta: banco, sentido: 'resta' });
  await mov(base, user, { tipo: 'traspaso', importe: '10.00', fecha: '2026-10-07', cuenta: banco, destino: cartera });
  await gasto(c.hogar, '10.00', '2026-10-08', cartera);
  await base.query(`update cuentas set fecha_cierre = '2026-10-08' where id = $1`, [cartera]);

  return { user, banco, cartera, movidos };
}

/** Totales por mes, gasto por categoría (nombre → gasto neto) y patrimonio, calculados en SQL. */
async function cifras(base: PGlite, user: string) {
  await actuarComo(base, user);
  const meses = await todas(
    base,
    `select mes::text, ingresos::text, gastos::text, devoluciones::text, gastos_netos::text, balance::text,
            ahorro_pct::text, ajustes::text
     from resumen_mensual('2026-09-01', '2026-10-31') order by mes`,
  );
  const porCategoria: Record<string, Record<string, string>> = {};
  for (const [mes, desde, hasta] of [['09', '2026-09-01', '2026-09-30'], ['10', '2026-10-01', '2026-10-31']] as const) {
    const filas = await todas<{ nombre: string; gasto: string }>(
      base, `select nombre, gasto::text from gasto_por_categoria($1, $2)`, [desde, hasta],
    );
    porCategoria[mes] = Object.fromEntries(filas.map((f) => [f.nombre, f.gasto]));
  }
  const patrimonio = await una(base, `select patrimonio('2026-09-30')::text as sep, patrimonio('2026-10-31')::text as oct`);
  return { meses, porCategoria, patrimonio };
}

const categoriasCompletas = (base: PGlite, user: string) =>
  todas(
    base,
    `select id, user_id, nombre, clave, tipo::text, color, icono, orden, archivada, created_at::text
     from categorias where user_id = $1 order by orden, nombre`,
    [user],
  );

const categoriasDeMovimientos = async (base: PGlite, user: string) =>
  Object.fromEntries(
    (await todas<{ id: string; categoria_id: string | null }>(
      base, `select id, categoria_id from movimientos where user_id = $1`, [user],
    )).map((f) => [f.id, f.categoria_id]),
  );

const existen = async (base: PGlite, tablas: string[]) =>
  (await todas<{ n: string }>(base, `select relname as n from pg_class where relname = any($1) order by relname`, [tablas]))
    .map((f) => f.n);

async function conVieja<T>(fn: (base: PGlite) => Promise<T>): Promise<T> {
  const base = await crearDb({ hasta: ANTERIORES });
  try {
    return await fn(base);
  } finally {
    await base.close();
  }
}

describe('migración', () => {
  it('los totales del mes (gastos, devoluciones, gastos netos, balance) y el patrimonio no cambian', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      const antes = await cifras(base, user);
      // Comprobación del propio escenario: septiembre 1500 − (177.89 − 25.25) = 1347.36.
      expect(antes.meses[0]).toMatchObject({ gastos: '177.89', devoluciones: '25.25', gastos_netos: '152.64', balance: '1347.36' });

      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);
      const despues = await cifras(base, user);

      expect(despues.meses).toEqual(antes.meses);
      expect(despues.patrimonio).toEqual(antes.patrimonio);
    });
  });

  it('el gasto de las 4 categorías se suma a «Otros gastos»; las demás categorías no cambian', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      const antes = await cifras(base, user);
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);
      const despues = await cifras(base, user);

      expect(antes.porCategoria['09']).toEqual({
        'Hogar': '40.10', 'Salud': '20.25', 'Cuidado personal': '12.30', 'Regalos': '40.00', 'Otros gastos': '9.99', 'Ocio': '30.00',
      });
      // 9.99 + 40.10 + 20.25 + 12.30 + 40.00
      expect(despues.porCategoria['09']).toEqual({ 'Otros gastos': '122.64', 'Ocio': '30.00' });
      // Octubre: 15.00 + (100.00 − 40.10 + 10.00) + (0.10 + 0.20)
      expect(antes.porCategoria['10']).toEqual({ 'Hogar': '69.90', 'Cuidado personal': '0.30', 'Otros gastos': '15.00' });
      expect(despues.porCategoria['10']).toEqual({ 'Otros gastos': '85.20' });
    });
  });

  it('mueve gastos y devoluciones (también de una cuenta cerrada) a «Otros gastos» del mismo usuario y borra las categorías', async () => {
    await conVieja(async (base) => {
      const a = await escenario(base);
      const b = await escenario(base);
      const otrosA = await categoria(base, a.user, 'otros_gastos');
      const otrosB = await categoria(base, b.user, 'otros_gastos');
      const ocioA = await categoria(base, a.user, 'ocio');
      const antesA = await categoriasDeMovimientos(base, a.user);

      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);

      const despuesA = await categoriasDeMovimientos(base, a.user);
      const despuesB = await categoriasDeMovimientos(base, b.user);
      expect(Object.keys(a.movidos)).toHaveLength(11);
      for (const id of Object.keys(a.movidos)) expect(despuesA[id]).toBe(otrosA);
      for (const id of Object.keys(b.movidos)) expect(despuesB[id]).toBe(otrosB);
      // Lo demás, igual (Ocio, Otros gastos, Nómina, traspaso y ajuste).
      for (const [id, cat] of Object.entries(antesA)) if (!(id in a.movidos)) expect(despuesA[id]).toBe(cat);
      expect(Object.values(despuesA)).toContain(ocioA);

      expect(await todas(base, `select 1 from categorias where clave = any($1)`, [CLAVES_ELIMINADAS])).toEqual([]);
      expect((await todas(base, `select 1 from categorias where user_id = $1`, [a.user]))).toHaveLength(11);
      // La vinculación de las devoluciones no cambia.
      expect((await una(base, `select count(*)::int as n from movimientos where user_id = $1 and devolucion_de is not null`, [a.user])).n)
        .toBe(1);
    });
  });

  it('el trigger de cuentas cerradas vuelve a estar activo y sigue protegiendo', async () => {
    await conVieja(async (base) => {
      const { user, cartera } = await escenario(base);
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);

      expect(await una(base, `select tgenabled from pg_trigger where tgname = 'movimientos_cuenta_cerrada'`)).toEqual({ tgenabled: 'O' });
      const ocio = await categoria(base, user, 'ocio');
      await expect(base.query(`update movimientos set categoria_id = $1 where cuenta_id = $2 and tipo = 'gasto'`, [ocio, cartera]))
        .rejects.toThrow(/está cerrada/);
    });
  });

  it('una categoría propia o renombrada (sin clave) no se toca, aunque se llame «Hogar»', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      const salud = await categoria(base, user, 'salud');
      await base.query(`update categorias set nombre = 'Médico' where id = $1`, [salud]);
      const otro = await prepararUsuario(base);
      await base.query(`update categorias set nombre = 'Casa' where user_id = $1 and clave = 'hogar'`, [otro]);
      const hogarPropio = (await una<{ id: string }>(
        base, `insert into categorias (user_id, nombre, tipo) values ($1, 'Hogar', 'gasto') returning id`, [otro],
      )).id;
      const cuenta = await crearCuenta(base, otro, { nombre: 'Banco', saldoInicial: '50.00' });
      const g = await mov(base, otro, { tipo: 'gasto', importe: '5.00', fecha: '2026-09-01', cuenta, categoria: hogarPropio });

      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);

      expect(await una(base, `select nombre, clave from categorias where id = $1`, [salud])).toEqual({ nombre: 'Médico', clave: null });
      expect(await una(base, `select categoria_id from movimientos where id = $1`, [g])).toEqual({ categoria_id: hogarPropio });
      expect((await todas<{ nombre: string }>(base, `select nombre from categorias where user_id = $1 order by nombre`, [otro]))
        .map((f) => f.nombre)).toEqual(expect.arrayContaining(['Casa', 'Hogar']));
    });
  });

  it('aborta sin cambiar nada si algún objetivo usa una de esas categorías', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      const salud = await categoria(base, user, 'salud');
      const regalos = await categoria(base, user, 'regalos');
      await base.query(`insert into objetivos (user_id, tipo, categoria_id, importe) values ($1, 'limite_categoria', $2, 50)`, [user, salud]);
      await base.query(`insert into objetivos (user_id, tipo, categoria_id, importe, activo) values ($1, 'limite_categoria', $2, 20, false)`,
        [user, regalos]);
      const antes = await categoriasDeMovimientos(base, user);

      await expect(base.exec(MIGRACION_ELIMINAR_CATEGORIAS)).rejects.toThrow(/Hay 2 objetivo\(s\) con las categorías/);

      expect((await una(base, `select count(*)::int as n from objetivos where user_id = $1`, [user])).n).toBe(2);
      expect((await todas(base, `select 1 from categorias where user_id = $1 and clave = any($2)`, [user, CLAVES_ELIMINADAS])))
        .toHaveLength(4);
      expect(await categoriasDeMovimientos(base, user)).toEqual(antes);
      expect(await existen(base, RESPALDOS)).toEqual([]);
    });
  });

  it('aborta si un usuario con movimientos en esas categorías no tiene «Otros gastos» activa', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      // Renombrada: pierde la clave y ya no es la de por defecto.
      await base.query(`update categorias set nombre = 'Varios' where user_id = $1 and clave = 'otros_gastos'`, [user]);
      await expect(base.exec(MIGRACION_ELIMINAR_CATEGORIAS))
        .rejects.toThrow(/1 usuario\(s\) tienen movimientos en Hogar, Salud, Cuidado personal o Regalos y no tienen la categoría «Otros gastos»/);
      expect(await existen(base, RESPALDOS)).toEqual([]);
    });
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      await base.query(`update categorias set archivada = true where user_id = $1 and clave = 'otros_gastos'`, [user]);
      await expect(base.exec(MIGRACION_ELIMINAR_CATEGORIAS)).rejects.toThrow(/no tienen la categoría «Otros gastos»/);
    });
  });

  it('sin movimientos en esas categorías no hace falta «Otros gastos»: se borran igual', async () => {
    await conVieja(async (base) => {
      const user = await prepararUsuario(base);
      await base.query(`update categorias set nombre = 'Varios' where user_id = $1 and clave = 'otros_gastos'`, [user]);
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);
      expect(await todas(base, `select 1 from categorias where user_id = $1 and clave = any($2)`, [user, CLAVES_ELIMINADAS])).toEqual([]);
    });
  });
});

describe('respaldo', () => {
  it('guarda las categorías y la categoría original de cada movimiento', async () => {
    await conVieja(async (base) => {
      const { user, movidos } = await escenario(base);
      const categoriasAntes = (await categoriasCompletas(base, user)).filter((c) => CLAVES_ELIMINADAS.includes(c.clave as string));
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);

      expect(await todas(
        base,
        `select id, user_id, nombre, clave, tipo::text, color, icono, orden, archivada, created_at::text
         from respaldo_20261102_categorias where user_id = $1 order by orden, nombre`,
        [user],
      )).toEqual(categoriasAntes);
      const filas = await todas<{ movimiento_id: string; categoria_id_original: string }>(
        base, `select movimiento_id, categoria_id_original from respaldo_20261102_movimientos_categoria where user_id = $1`, [user],
      );
      expect(Object.fromEntries(filas.map((f) => [f.movimiento_id, f.categoria_id_original]))).toEqual(movidos);
    });
  });

  it('no sale en la API: RLS activa y sin permisos para anon ni authenticated', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);

      for (const tabla of RESPALDOS) {
        expect(await una(base, `select relrowsecurity as rls from pg_class where relname = $1`, [tabla])).toEqual({ rls: true });
        for (const rol of ['anon', 'authenticated']) {
          for (const permiso of ['select', 'insert', 'update', 'delete']) {
            expect((await una<{ p: boolean }>(base, `select has_table_privilege($1, $2, $3) as p`, [rol, tabla, permiso])).p,
              `${rol} ${permiso} ${tabla}`).toBe(false);
          }
        }
        await actuarComo(base, user);
        for (const rol of ['anon', 'authenticated'] as const) {
          await expect(conRol(base, rol, () => base.query(`select * from ${tabla}`))).rejects.toThrow(/permission denied/);
        }
      }
    });
  });
});

describe('usuarios nuevos', () => {
  it('completar_onboarding y preparar_usuario crean las 11 categorías, sin las 4 eliminadas', async () => {
    const db = await crearDb();
    try {
      const u = randomUUID();
      await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@test.local`]);
      await actuarComo(db, u);
      await conRol(db, 'authenticated', () => db.query(`select completar_onboarding('es', $1::jsonb, '0')`,
        [JSON.stringify([{ entidad: 'bbva', nombre: '', color: null, saldo: '10' }])]));
      const orden = (id: string) => todas<{ nombre: string; clave: string; orden: number }>(
        db, `select nombre, clave, orden from categorias where user_id = $1 order by orden`, [id],
      );
      const filas = await orden(u);
      expect(filas.map(({ nombre, clave }) => ({ nombre, clave }))).toEqual(CATEGORIAS_POR_DEFECTO);
      expect(filas.map((f) => f.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(await orden(await prepararUsuario(db))).toEqual(filas);
    } finally {
      await db.close();
    }
  });

  it('las claves eliminadas ya no son válidas ni tienen traducción', async () => {
    const db = await crearDb();
    try {
      const u = await prepararUsuario(db);
      for (const clave of CLAVES_ELIMINADAS) {
        await expect(db.query(`insert into categorias (user_id, nombre, clave, tipo) values ($1, 'X', $2, 'gasto')`, [u, clave]))
          .rejects.toThrow(/categorias_clave_valida/);
        expect(await una(db, `select traduccion_categoria($1, 'es') as t`, [clave])).toEqual({ t: null });
      }
      expect(await una(db, `select traduccion_categoria('otros_gastos', 'en') as t`)).toEqual({ t: 'Other expenses' });
    } finally {
      await db.close();
    }
  });
});

describe('rollback', () => {
  it('recrea las categorías iguales, devuelve cada movimiento a la suya, restaura el onboarding y borra el respaldo', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      const categoriasAntes = await categoriasCompletas(base, user);
      const movimientosAntes = await categoriasDeMovimientos(base, user);
      const cifrasAntes = await cifras(base, user);

      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);
      await base.exec(ROLLBACK_ELIMINAR_CATEGORIAS);

      expect(await categoriasCompletas(base, user)).toEqual(categoriasAntes);
      expect(await categoriasDeMovimientos(base, user)).toEqual(movimientosAntes);
      expect(await cifras(base, user)).toEqual(cifrasAntes);
      expect(await existen(base, RESPALDOS)).toEqual([]);
      expect(await una(base, `select tgenabled from pg_trigger where tgname = 'movimientos_cuenta_cerrada'`)).toEqual({ tgenabled: 'O' });
      expect(await una(base, `select traduccion_categoria('cuidado_personal', 'ca') as t`)).toEqual({ t: 'Cura personal' });

      const nuevo = await prepararUsuario(base);
      expect((await todas<{ nombre: string; clave: string }>(
        base, `select nombre, clave from categorias where user_id = $1 order by orden`, [nuevo],
      ))).toEqual(CATEGORIAS_POR_DEFECTO_ANTERIORES);

      // Se puede volver a aplicar.
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);
      expect(await todas(base, `select 1 from categorias where clave = any($1)`, [CLAVES_ELIMINADAS])).toEqual([]);
    });
  });

  it('respeta un cambio de categoría hecho a mano después de la migración', async () => {
    await conVieja(async (base) => {
      const { user, movidos } = await escenario(base);
      const ocio = await categoria(base, user, 'ocio');
      const hogar = await categoria(base, user, 'hogar');
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);
      const [cambiado, otro] = Object.entries(movidos).filter(([, cat]) => cat === hogar).map(([id]) => id);
      await base.query(`update movimientos set categoria_id = $1 where id = $2`, [ocio, cambiado]);

      await base.exec(ROLLBACK_ELIMINAR_CATEGORIAS);
      expect(await una(base, `select categoria_id from movimientos where id = $1`, [cambiado])).toEqual({ categoria_id: ocio });
      expect(await una(base, `select categoria_id from movimientos where id = $1`, [otro])).toEqual({ categoria_id: hogar });
    });
  });

  it('se aborta con un mensaje claro si el usuario ha creado otra categoría con el mismo nombre', async () => {
    await conVieja(async (base) => {
      const { user } = await escenario(base);
      await base.exec(MIGRACION_ELIMINAR_CATEGORIAS);
      await base.query(`insert into categorias (user_id, nombre, tipo) values ($1, 'Regalos', 'gasto')`, [user]);

      await expect(base.exec(ROLLBACK_ELIMINAR_CATEGORIAS)).rejects.toThrow(/Hay 1 categoría\(s\) con el mismo nombre/);
      // Nada a medias: el respaldo sigue ahí y las claves eliminadas siguen sin ser válidas.
      expect(await existen(base, RESPALDOS)).toEqual(RESPALDOS);
      await expect(base.query(`insert into categorias (user_id, nombre, clave, tipo) values ($1, 'X', 'hogar', 'gasto')`, [user]))
        .rejects.toThrow(/categorias_clave_valida/);
    });
  });
});
