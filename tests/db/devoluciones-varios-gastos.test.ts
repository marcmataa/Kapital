/**
 * Migración 20261103000001_devoluciones_varios_gastos.sql: una devolución que cubre varios gastos
 * (una devolución por gasto, agrupadas), el sobrante como ingreso y sugerencias en las que manda el
 * parecido del nombre (docs/reglas-financieras.md, secciones 3, 10 y 11). Cifras inventadas.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIGRACION_DEVOLUCIONES_VARIOS_GASTOS, ROLLBACK_DEVOLUCIONES_VARIOS_GASTOS, actuarComo, conRol, crearCategoria,
  crearCuenta, crearDb, crearUsuario, mov, resumen, todas, una,
} from './helpers.js';

let db: PGlite;
let u: string;
let bbva: string;
let deporte: string;
let ocio: string;
let otrosIngresos: string;
let regalos: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  u = await crearUsuario(db);
  bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '1000.00', fechaInicial: '2024-01-01', principal: true });
  deporte = await crearCategoria(db, u, 'Deporte', 'gasto');
  ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  otrosIngresos = (await una<{ id: string }>(
    db,
    `insert into categorias (user_id, nombre, tipo, clave) values ($1, 'Otros ingresos', 'ingreso', 'otros_ingresos') returning id`,
    [u],
  )).id;
  regalos = await crearCategoria(db, u, 'Regalos recibidos', 'ingreso');
});

/** Ejecuta `sql` como el usuario `u` desde la app (rol authenticated, como PostgREST). */
async function comoUsuario<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () => (await db.query<T>(sql, params)).rows);
}

function gasto(importe: string, fecha: string, concepto: string, categoria = deporte) {
  return mov(db, u, { tipo: 'gasto', importe, fecha, cuenta: bbva, categoria, metodo: 'tarjeta', concepto });
}

type Fila = { id: string; tipo: string; importe: string; devolucion_de: string | null; categoria_id: string; grupo_devolucion: string | null };

/** Llama a registrar_devoluciones como `u`. */
function registrar(
  repartos: { gasto: string; importe: string }[],
  o: { sobrante?: string | null; categoriaSobrante?: string | null; fecha?: string; concepto?: string } = {},
) {
  return comoUsuario<Fila>(
    `select id, tipo, importe::text, devolucion_de, categoria_id, grupo_devolucion
     from registrar_devoluciones($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [o.fecha ?? '2026-10-20', bbva, o.concepto ?? 'Bizum pádel', 'bizum', 'Me lo pasa Marta',
     JSON.stringify(repartos), o.sobrante ?? null, o.categoriaSobrante ?? null],
  );
}

const movimientosDe = (usuario: string) =>
  todas<{ tipo: string; importe: string }>(db, `select tipo, importe::text from movimientos where user_id = $1 and tipo <> 'gasto' order by created_at, importe`, [usuario]);

describe('Sección 11 · devolución repartida entre varios gastos', () => {
  it('56,00 € entre tres clases de pádel: una devolución por gasto, con su importe, agrupadas y con los datos comunes', async () => {
    const clase1 = await gasto('20.00', '2026-10-01', 'Clase pádel');
    const clase2 = await gasto('20.00', '2026-10-08', 'Clase pádel');
    const clase3 = await gasto('20.00', '2026-10-15', 'Clase pádel');

    const filas = await registrar([
      { gasto: clase1, importe: '20.00' }, { gasto: clase2, importe: '20.00' }, { gasto: clase3, importe: '16,00' },
    ]);
    expect(filas.map((f) => [f.tipo, f.importe, f.devolucion_de])).toEqual([
      ['devolucion', '20.00', clase1], ['devolucion', '20.00', clase2], ['devolucion', '16.00', clase3],
    ]);
    const grupo = filas[0]?.grupo_devolucion;
    expect(grupo).toMatch(/^[0-9a-f-]{36}$/);
    expect(filas.every((f) => f.grupo_devolucion === grupo)).toBe(true);

    const guardadas = await todas(
      db,
      `select fecha::text, cuenta_id, concepto, metodo, notas, origen from movimientos where grupo_devolucion = $1`, [grupo],
    );
    expect(guardadas).toHaveLength(3);
    for (const g of guardadas) {
      expect(g).toEqual({ fecha: '2026-10-20', cuenta_id: bbva, concepto: 'Bizum pádel', metodo: 'bizum', notas: 'Me lo pasa Marta', origen: 'app' });
    }
    // Gasto neto de Deporte en octubre: 60,00 − 56,00 = 4,00 €; los ingresos no cambian.
    await actuarComo(db, u);
    const r = await resumen(db, '2026-10-01', '2026-10-31');
    expect({ ingresos: r.ingresos, gastos: r.gastos, devoluciones: r.devoluciones, gastos_netos: r.gastos_netos })
      .toEqual({ ingresos: '0.00', gastos: '60.00', devoluciones: '56.00', gastos_netos: '4.00' });
  });

  it('la categoría de cada devolución es la de su gasto', async () => {
    const pista = await gasto('30.00', '2026-10-01', 'Pista pádel', deporte);
    const cena = await gasto('25.00', '2026-10-02', 'Cena después', ocio);
    const filas = await registrar([{ gasto: pista, importe: '30' }, { gasto: cena, importe: '5' }]);
    expect(filas.map((f) => f.categoria_id)).toEqual([deporte, ocio]);
  });

  it('una sola devolución sin sobrante no crea grupo', async () => {
    const cena = await gasto('50.00', '2026-10-10', 'Cena');
    const [fila] = await registrar([{ gasto: cena, importe: '20.00' }]);
    expect(fila).toMatchObject({ tipo: 'devolucion', importe: '20.00', devolucion_de: cena, grupo_devolucion: null });
  });
});

describe('Sección 11 · sobrante como ingreso', () => {
  it('60,00 € sobre una cena de 50,00 €: 50,00 € de devolución + 10,00 € de ingreso en Otros ingresos, mismo grupo', async () => {
    const cena = await gasto('50.00', '2026-10-10', 'Cena', ocio);
    const filas = await registrar([{ gasto: cena, importe: '50.00' }], { sobrante: '10,00' });
    expect(filas.map((f) => [f.tipo, f.importe, f.devolucion_de, f.categoria_id])).toEqual([
      ['devolucion', '50.00', cena, ocio],
      ['ingreso', '10.00', null, otrosIngresos],
    ]);
    expect(filas[0]?.grupo_devolucion).not.toBeNull();
    expect(filas[1]?.grupo_devolucion).toBe(filas[0]?.grupo_devolucion);

    // El ingreso suma a ingresos; la devolución no (resta del gasto).
    await actuarComo(db, u);
    const r = await resumen(db, '2026-10-01', '2026-10-31');
    expect({ ingresos: r.ingresos, devoluciones: r.devoluciones, gastos_netos: r.gastos_netos, balance: r.balance })
      .toEqual({ ingresos: '10.00', devoluciones: '50.00', gastos_netos: '0.00', balance: '10.00' });
  });

  it('el sobrante puede ir a otra categoría de ingreso', async () => {
    const cena = await gasto('50.00', '2026-10-10', 'Cena', ocio);
    const filas = await registrar([{ gasto: cena, importe: '50.00' }], { sobrante: '10.00', categoriaSobrante: regalos });
    expect(filas[1]).toMatchObject({ tipo: 'ingreso', importe: '10.00', categoria_id: regalos });
  });

  it('la categoría del sobrante tiene que ser de ingreso y del usuario', async () => {
    const cena = await gasto('50.00', '2026-10-10', 'Cena', ocio);
    await expect(registrar([{ gasto: cena, importe: '50.00' }], { sobrante: '10.00', categoriaSobrante: ocio }))
      .rejects.toThrow('El sobrante necesita una categoría de ingreso tuya');
    expect(await movimientosDe(u)).toEqual([]);
  });

  it('solo puede sobrar dinero si cada gasto se devuelve entero', async () => {
    const a = await gasto('30.00', '2026-10-01', 'Clase pádel');
    const b = await gasto('30.00', '2026-10-02', 'Clase pádel');
    await expect(registrar([{ gasto: a, importe: '30.00' }, { gasto: b, importe: '20.00' }], { sobrante: '10.00' }))
      .rejects.toThrow(/no cuadra/);
    expect(await movimientosDe(u)).toEqual([]);
  });
});

describe('registrar_devoluciones · validaciones y atomicidad', () => {
  it('si una parte falla no se guarda nada (la tercera supera lo pendiente de su gasto)', async () => {
    const a = await gasto('20.00', '2026-10-01', 'Clase pádel');
    const b = await gasto('20.00', '2026-10-08', 'Clase pádel');
    const c = await gasto('10.00', '2026-10-15', 'Clase pádel');
    await expect(registrar([{ gasto: a, importe: '20' }, { gasto: b, importe: '20' }, { gasto: c, importe: '16' }]))
      .rejects.toThrow(/superan el gasto original/);
    expect(await movimientosDe(u)).toEqual([]);
  });

  it('una devolución anterior a alguno de sus gastos tampoco deja nada a medias', async () => {
    const a = await gasto('20.00', '2026-10-01', 'Clase pádel');
    const b = await gasto('20.00', '2026-10-25', 'Clase pádel');
    await expect(registrar([{ gasto: a, importe: '20' }, { gasto: b, importe: '20' }], { sobrante: '5' }))
      .rejects.toThrow(/no puede ser anterior a su gasto/);
    expect(await movimientosDe(u)).toEqual([]);
  });

  it('rechaza el gasto de otro usuario, aunque vaya con uno propio', async () => {
    const propio = await gasto('20.00', '2026-10-01', 'Clase pádel');
    const otro = await crearUsuario(db);
    const suya = await crearCuenta(db, otro, { nombre: 'BBVA', fechaInicial: '2024-01-01' });
    const suDeporte = await crearCategoria(db, otro, 'Deporte', 'gasto');
    const ajeno = await mov(db, otro, { tipo: 'gasto', importe: '50.00', fecha: '2026-10-01', cuenta: suya, categoria: suDeporte, concepto: 'Pádel' });
    await expect(registrar([{ gasto: propio, importe: '20' }, { gasto: ajeno, importe: '10' }]))
      .rejects.toThrow('Solo se puede devolver un gasto tuyo que exista');
    expect(await movimientosDe(u)).toEqual([]);
    expect(await movimientosDe(otro)).toEqual([]);
  });

  it('rechaza un gasto repetido, algo que no es un gasto, importes no válidos y un reparto vacío', async () => {
    const a = await gasto('20.00', '2026-10-01', 'Clase pádel');
    const ingreso = await mov(db, u, { tipo: 'ingreso', importe: '100.00', fecha: '2026-10-01', cuenta: bbva, categoria: otrosIngresos });
    await expect(registrar([{ gasto: a, importe: '10' }, { gasto: a, importe: '10' }])).rejects.toThrow('repetido');
    await expect(registrar([{ gasto: ingreso, importe: '10' }])).rejects.toThrow('Solo se puede devolver un gasto');
    await expect(registrar([{ gasto: a, importe: '0' }])).rejects.toThrow('mayor que 0');
    await expect(registrar([{ gasto: a, importe: 'abc' }])).rejects.toThrow('mayor que 0');
    await expect(registrar([{ gasto: 'no-es-un-uuid', importe: '10' }])).rejects.toThrow('Solo se puede devolver un gasto tuyo');
    await expect(registrar([])).rejects.toThrow('Elige al menos un gasto');
    await expect(registrar([{ gasto: a, importe: '10' }], { sobrante: '-0' })).rejects.toThrow('sobrante no es válido');
    expect(await todas(db, `select 1 from movimientos where user_id = $1 and tipo = 'devolucion'`, [u])).toEqual([]);
  });

  it('el importe se lee con leer_importe: «1.258,00» y «-24» son importes exactos', async () => {
    const tele = await gasto('1500.00', '2026-10-01', 'Televisor');
    const filas = await registrar([{ gasto: tele, importe: '1.258,00' }]);
    expect(filas[0]?.importe).toBe('1258.00');
    const otra = await gasto('30.00', '2026-10-01', 'Cena');
    expect((await registrar([{ gasto: otra, importe: '-24' }]))[0]?.importe).toBe('24.00');
  });

  it('anon no puede llamarla y solo authenticated tiene permiso', async () => {
    await actuarComo(db, null);
    await expect(conRol(db, 'anon', () => db.query(
      `select * from registrar_devoluciones('2026-10-20', $1, 'x', null, null, '[]'::jsonb)`, [bbva],
    ))).rejects.toThrow(/permission denied/);
    const permisos = await una<{ anon: boolean; auth: boolean; pub: boolean }>(
      db,
      `select has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as pub
       from pg_proc p where p.proname = 'registrar_devoluciones'`,
    );
    expect(permisos).toEqual({ anon: false, auth: true, pub: false });
  });
});

describe('grupo_devolucion', () => {
  it('solo en devoluciones e ingresos: si una fila del grupo pasa a gasto, sale del grupo', async () => {
    const cena = await gasto('50.00', '2026-10-10', 'Cena', ocio);
    const filas = await registrar([{ gasto: cena, importe: '50.00' }], { sobrante: '10.00' });
    const ingreso = filas[1]?.id;
    await comoUsuario(`update movimientos set tipo = 'gasto', categoria_id = $1 where id = $2`, [ocio, ingreso]);
    expect(await una(db, `select tipo, grupo_devolucion from movimientos where id = $1`, [ingreso]))
      .toEqual({ tipo: 'gasto', grupo_devolucion: null });
    await expect(db.query(
      `insert into movimientos (user_id, tipo, importe, fecha, cuenta_id, categoria_id, concepto, grupo_devolucion)
       values ($1, 'gasto', 5, '2026-10-10', $2, $3, 'x', gen_random_uuid())`, [u, bbva, ocio],
    )).rejects.toThrow(/grupo_devolucion_solo_devolucion_ingreso/);
  });
});

describe('Sugerencias: manda el parecido del nombre', () => {
  type Candidato = { id: string; concepto: string; puntuacion: number; motivo: string };
  const COLUMNAS = 'id, concepto, puntuacion, motivo';
  let razz: string;
  let entradasRazz: string;
  let cena: string;
  let mercadona: string;

  beforeEach(async () => {
    razz = await gasto('45.00', '2026-09-30', 'Razzmatazz', ocio);
    entradasRazz = await gasto('60.00', '2026-09-20', 'Entradas Razzmatazz', ocio);
    cena = await gasto('20.00', '2026-10-19', 'Cena Ginos', ocio);
    mercadona = await gasto('35.00', '2026-10-18', 'Mercadona', ocio);
  });

  const buscar = (concepto: string | null, importe: string | null) =>
    comoUsuario<Candidato>(`select ${COLUMNAS} from buscar_gastos_devolvibles($1, $2, '2026-10-20')`, [concepto, importe]);

  it('«entrada razz» de 20 €: primero los gastos con palabras en común, no la cena de 20 € sin ninguna', async () => {
    const filas = await buscar('Devolución entrada razz', '20,00');
    // 2 palabras en común > 1 palabra en común > ninguna (ahí desempatan importe y fecha).
    expect(filas.map((f) => f.id)).toEqual([entradasRazz, razz, cena, mercadona]);
    expect(filas.map((f) => f.motivo)).toEqual(['concepto_parecido', 'concepto_parecido', 'importe_exacto', 'importe_parecido']);
    // Con la puntuación de antes la cena (importe exacto + ayer) quedaba por delante de «Razzmatazz».
    const puntos = new Map(filas.map((f) => [f.id, f.puntuacion]));
    expect(puntos.get(cena)).toBeGreaterThan(puntos.get(razz) ?? 100);
  });

  it('las palabras vacías no cuentan y una palabra suelta da el motivo «palabras_en_comun»', async () => {
    const tres = await gasto('15.00', '2026-10-01', 'Concierto sala grande', ocio);
    const filas = await buscar('Bizum de la entrada del concierto razz sala', '20');
    // «concierto» y «sala» (2 de 4) en el concierto; «entrada» y «razz» en Entradas Razzmatazz; «razz» en Razzmatazz.
    expect(filas.map((f) => f.id).slice(0, 3)).toEqual([entradasRazz, tres, razz]);
    expect(filas.find((f) => f.id === razz)?.motivo).toBe('palabras_en_comun');
    // Solo con palabras vacías no hay parecido de nombre: ordena por importe y fecha.
    expect((await buscar('Bizum de la devolución', '20')).map((f) => f.id)[0]).toBe(cena);
  });

  it('sin palabras en común con ningún gasto (o sin concepto), ordena por importe y fecha como antes', async () => {
    expect((await buscar('Devolución Zara', '20')).map((f) => f.id)).toEqual([cena, mercadona, razz, entradasRazz]);
    expect((await buscar(null, '20')).map((f) => f.id)).toEqual([cena, mercadona, razz, entradasRazz]);
  });
});

describe('rollback', () => {
  it('el down quita la columna y la RPC, conserva las filas y la migración se puede volver a aplicar', async () => {
    const limpia = await crearDb();
    try {
      const v = await crearUsuario(limpia);
      const cuenta = await crearCuenta(limpia, v, { nombre: 'BBVA', fechaInicial: '2024-01-01' });
      const cat = await crearCategoria(limpia, v, 'Ocio', 'gasto');
      const g = await mov(limpia, v, { tipo: 'gasto', importe: '50.00', fecha: '2026-10-01', cuenta, categoria: cat });
      await mov(limpia, v, { tipo: 'devolucion', importe: '20.00', fecha: '2026-10-02', cuenta, categoria: cat, devolucionDe: g });

      await limpia.exec(ROLLBACK_DEVOLUCIONES_VARIOS_GASTOS);
      expect(await todas(limpia, `select 1 from pg_proc where proname in ('registrar_devoluciones', 'salir_de_grupo_devolucion')`)).toEqual([]);
      expect(await todas(limpia, `select 1 from information_schema.columns where table_name = 'movimientos' and column_name = 'grupo_devolucion'`)).toEqual([]);
      expect(await todas(limpia, `select tipo from movimientos where user_id = $1 order by fecha`, [v])).toEqual([{ tipo: 'gasto' }, { tipo: 'devolucion' }]);
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'buscar_gastos_devolvibles'`)).toHaveLength(1);

      await limpia.exec(MIGRACION_DEVOLUCIONES_VARIOS_GASTOS);
      expect(await todas(limpia, `select 1 from pg_proc where proname = 'registrar_devoluciones'`)).toHaveLength(1);
    } finally {
      await limpia.close();
    }
  });
});
