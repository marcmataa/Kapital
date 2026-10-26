/**
 * Análisis mensual: tabla analisis_mensuales (RLS), datos_analisis,
 * datos_analisis_usuario y solicitar_regeneracion.
 * Las cifras son las de docs/reglas-financieras.md (secciones 3, 5 y 11).
 * Los meses se calculan desde hoy para no depender de la fecha del reloj.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  actuarComo, conRol, crearCategoria, crearCuenta, crearDb, crearUsuario, mov, todas, una, valorar,
} from './helpers.js';

let db: PGlite;
let u: string;
/** Mes en curso, mes anterior (el que se analiza) y el de antes. Siempre 'YYYY-MM-01'. */
let actual: string;
let mes: string;
let anterior: string;

beforeAll(async () => { db = await crearDb(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  u = await crearUsuario(db);
  ({ actual, mes, anterior } = await una<{ actual: string; mes: string; anterior: string }>(
    db,
    `select to_char(m, 'YYYY-MM-DD') as actual,
            to_char(m - interval '1 month', 'YYYY-MM-DD') as mes,
            to_char(m - interval '2 month', 'YYYY-MM-DD') as anterior
     from date_trunc('month', hoy_usuario()::timestamp) m`,
  ));
});

/** Día n de un mes 'YYYY-MM-01'. */
const dia = (m: string, n: number) => `${m.slice(0, 8)}${String(n).padStart(2, '0')}`;
const vispera = async (m: string) => (await una<{ d: string }>(db, `select ($1::date - 1)::text as d`, [m])).d;

async function datos(m: string): Promise<Record<string, unknown>> {
  await actuarComo(db, u);
  return conRol(db, 'authenticated', async () =>
    (await una<{ d: Record<string, unknown> }>(db, `select datos_analisis($1) as d`, [m])).d);
}

/** Ningún importe puede llegar como número JSON. */
function sinNumeros(valor: unknown, ruta = '$'): void {
  expect(typeof valor, ruta).not.toBe('number');
  if (Array.isArray(valor)) valor.forEach((v, i) => sinNumeros(v, `${ruta}[${i}]`));
  else if (valor && typeof valor === 'object') for (const [k, v] of Object.entries(valor)) sinNumeros(v, `${ruta}.${k}`);
}

/** Septiembre de la sección 3 + el traspaso y las valoraciones de la sección 5, en `mes`. */
async function mesDePrueba(): Promise<void> {
  const bbva = await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '2000.00', fechaInicial: '2020-01-01', principal: true });
  const tr = await crearCuenta(db, u, { nombre: 'Trade Republic', tipo: 'inversion', fechaInicial: '2020-01-01' });
  const nomina = await crearCategoria(db, u, 'Nómina', 'ingreso');
  const otrosIngresos = await crearCategoria(db, u, 'Otros ingresos', 'ingreso');
  const restaurantes = await crearCategoria(db, u, 'Restaurantes', 'gasto');
  const ocio = await crearCategoria(db, u, 'Ocio', 'gasto');
  const otrosGastos = await crearCategoria(db, u, 'Otros gastos', 'gasto');
  const transporte = await crearCategoria(db, u, 'Transporte', 'gasto');

  // Mes anterior: sin ingresos y con una categoría en negativo (−30,00 €).
  await mov(db, u, { tipo: 'gasto', importe: '20.00', fecha: dia(anterior, 3), cuenta: bbva, categoria: otrosGastos, metodo: 'tarjeta' });
  await mov(db, u, { tipo: 'devolucion', importe: '50.00', fecha: dia(anterior, 4), cuenta: bbva, categoria: otrosGastos });
  await valorar(db, u, tr, await vispera(mes), '1472.56');

  // Mes analizado: 1.508,00 € de ingresos y 1.168,28 € de gastos netos.
  await mov(db, u, { tipo: 'ingreso', importe: '1258.00', fecha: dia(mes, 1), cuenta: bbva, categoria: nomina });
  await mov(db, u, { tipo: 'ingreso', importe: '250.00', fecha: dia(mes, 15), cuenta: bbva, categoria: otrosIngresos });
  await mov(db, u, { tipo: 'gasto', importe: '1000.00', fecha: dia(mes, 5), cuenta: bbva, categoria: restaurantes, metodo: 'tarjeta' });
  await mov(db, u, { tipo: 'gasto', importe: '198.28', fecha: dia(mes, 20), cuenta: bbva, categoria: ocio, metodo: 'bizum' });
  await mov(db, u, { tipo: 'devolucion', importe: '30.00', fecha: dia(mes, 21), cuenta: bbva, categoria: ocio });
  await mov(db, u, { tipo: 'traspaso', importe: '100.00', fecha: dia(mes, 5), cuenta: bbva, destino: tr });
  await valorar(db, u, tr, dia(mes, 15), '1600.00');

  await db.query(
    `insert into objetivos (user_id, tipo, categoria_id, importe, activo) values
       ($1, 'ahorro_mensual', null, 500, true), ($1, 'limite_categoria', $2, 150, true),
       ($1, 'limite_categoria', $3, 50, true), ($1, 'limite_categoria', $4, 10, false)`,
    [u, ocio, transporte, restaurantes],
  );
}

describe('datos_analisis', () => {
  it('devuelve los agregados del mes con la forma del contrato y los importes exactos como texto', async () => {
    await mesDePrueba();
    const d = await datos(mes);
    sinNumeros(d);

    expect(d).toMatchObject({ mes, mes_incompleto: false, idioma: 'es' });
    expect(d.resumen).toMatchObject({
      ingresos: '1508.00', gastos: '1198.28', devoluciones: '30.00', gastos_netos: '1168.28',
      balance: '339.72', ajustes: '0.00',
    });
    // 339,72 / 1.508,00 × 100 = 22,5278… → se muestra 22,5 %. Precisión completa, sin redondear.
    expect((d.resumen as { ahorro_pct: string }).ahorro_pct).toMatch(/^22\.52785145/);

    expect(d.resumen_mes_anterior).toEqual({
      ingresos: '0.00', gastos: '20.00', devoluciones: '50.00', gastos_netos: '-30.00',
      balance: '30.00', ahorro_pct: null, ajustes: '0.00',
    });
    expect(d.categorias).toEqual([
      { nombre: 'Restaurantes', clave: null, etiqueta: 'Restaurantes', color: '#8f9bbd', gasto: '1000.00' },
      { nombre: 'Ocio', clave: null, etiqueta: 'Ocio', color: '#8f9bbd', gasto: '168.28' },
    ]);
    expect(d.categorias_mes_anterior).toEqual([
      { nombre: 'Otros gastos', clave: null, etiqueta: 'Otros gastos', color: '#8f9bbd', gasto: '-30.00' },
    ]);
    expect(d.metodos).toEqual([{ metodo: 'tarjeta', gasto: '1000.00' }, { metodo: 'bizum', gasto: '198.28' }]);

    // Sección 5: ΔPatrimonio = balance 339,72 + revalorización 27,44 = 367,16; el traspaso suma cero.
    expect(d.variacion).toEqual({
      patrimonio_inicial: '3502.56', patrimonio_final: '3869.72', balance: '339.72',
      revalorizacion: '27.44', ajustes: '0.00', saldos_iniciales: '0.00', variacion: '367.16', base: 'partida',
    });

    expect(d.objetivos).toEqual([
      { tipo: 'ahorro_mensual', categoria: null, clave: null, etiqueta: null, importe: '500.00', actual: '339.72' },
      { tipo: 'limite_categoria', categoria: 'Ocio', clave: null, etiqueta: 'Ocio', importe: '150.00', actual: '168.28' },
      { tipo: 'limite_categoria', categoria: 'Transporte', clave: null, etiqueta: 'Transporte', importe: '50.00', actual: '0.00' },
    ]);
  });

  it('cualquier día del mes se normaliza al día 1', async () => {
    await mesDePrueba();
    expect((await datos(dia(mes, 17))).mes).toBe(mes);
  });

  it('mes_incompleto si la cuenta más antigua empieza después del día 1, o si no hay cuentas', async () => {
    expect((await datos(mes)).mes_incompleto).toBe(true);
    await crearCuenta(db, u, { nombre: 'BBVA', saldoInicial: '10.00', fechaInicial: dia(mes, 10) });
    const d = await datos(mes);
    expect(d.mes_incompleto).toBe(true);
    // La cuenta abierta a mitad de mes no es ganancia: su saldo inicial es parte del patrimonio de partida.
    expect(d.variacion).toMatchObject({
      patrimonio_inicial: '10.00', patrimonio_final: '10.00', balance: '0.00', saldos_iniciales: '10.00', variacion: '0.00',
    });
    await crearCuenta(db, u, { nombre: 'Efectivo', tipo: 'efectivo', fechaInicial: mes });
    expect((await datos(mes)).mes_incompleto).toBe(false);
  });

  it('un mes sin datos da ceros exactos y ahorro nulo', async () => {
    const d = await datos(mes);
    expect(d.resumen).toEqual({
      ingresos: '0.00', gastos: '0.00', devoluciones: '0.00', gastos_netos: '0.00',
      balance: '0.00', ahorro_pct: null, ajustes: '0.00',
    });
    expect(d).toMatchObject({ categorias: [], categorias_mes_anterior: [], metodos: [], objetivos: [] });
  });

  it('el idioma es el del perfil', async () => {
    await db.query(`update perfiles set idioma = 'ca' where user_id = $1`, [u]);
    expect((await datos(mes)).idioma).toBe('ca');
  });

  it('el mes en curso compara el patrimonio de hoy, no el de fin de mes', async () => {
    await mesDePrueba();
    const d = await datos(actual);
    const { hoy } = await una<{ hoy: string }>(db, `select patrimonio(hoy_usuario())::text as hoy`);
    expect(d.variacion).toMatchObject({ patrimonio_inicial: '3869.72', patrimonio_final: hoy, variacion: '0.00' });
  });

  it('un mes que no ha empezado es un error', async () => {
    const { futuro } = await una<{ futuro: string }>(db, `select ($1::date + interval '1 month')::date::text as futuro`, [actual]);
    await expect(datos(futuro)).rejects.toThrow(/todavía no ha empezado/);
  });

  it('solo ve los datos del usuario de la sesión', async () => {
    await mesDePrueba();
    const propio = u;
    u = await crearUsuario(db);
    expect((await datos(mes)).resumen).toMatchObject({ ingresos: '0.00' });
    u = propio;
  });

  it('sin sesión es un error', async () => {
    await actuarComo(db, null);
    await expect(conRol(db, 'authenticated', () => db.query(`select datos_analisis($1)`, [mes])))
      .rejects.toThrow(/iniciar sesión/);
  });
});

describe('datos_analisis_usuario', () => {
  it('service_role obtiene los datos de un usuario igual que él mismo, sin dejarle la sesión puesta', async () => {
    await mesDePrueba();
    const propios = await datos(mes);
    await actuarComo(db, null);
    const comoServicio = await conRol(db, 'service_role', async () =>
      (await una<{ d: unknown }>(db, `select datos_analisis_usuario($1, $2) as d`, [u, mes])).d);
    expect(comoServicio).toEqual(propios);
    expect((await una(db, `select auth.uid() as uid`)).uid).toBeNull();
  });

  it('dentro de una transacción también restaura la sesión', async () => {
    await mesDePrueba();
    await actuarComo(db, null);
    await db.transaction(async (tx) => {
      await tx.query(`select datos_analisis_usuario($1, $2)`, [u, mes]);
      expect((await tx.query<{ uid: string | null }>(`select auth.uid() as uid`)).rows[0]?.uid).toBeNull();
    });
  });

  it('un usuario inexistente es un error', async () => {
    await expect(db.query(`select datos_analisis_usuario(gen_random_uuid(), $1)`, [mes])).rejects.toThrow(/no encontrado/);
  });

  it('ni authenticated ni anon pueden ejecutarla', async () => {
    for (const rol of ['authenticated', 'anon'] as const) {
      await conRol(db, rol, async () => {
        await expect(db.query(`select datos_analisis_usuario($1, $2)`, [u, mes])).rejects.toThrow(/permission denied/);
      });
    }
    const { puede } = await una<{ puede: boolean }>(
      db, `select has_function_privilege('service_role', 'datos_analisis_usuario(uuid, date)', 'execute') as puede`,
    );
    expect(puede).toBe(true);
  });
});

describe('analisis_mensuales', () => {
  async function fila(user: string, m: string, o: { estado?: string; regeneraciones?: number } = {}): Promise<string> {
    return (await una<{ id: string }>(
      db,
      `insert into analisis_mensuales (user_id, mes, estado, regeneraciones, intentos, error_codigo)
       values ($1, $2, $3, $4, 2, case when $3 = 'error' then 'proveedor' end) returning id`,
      [user, m, o.estado ?? 'listo', o.regeneraciones ?? 0],
    )).id;
  }

  it('cada usuario lee solo sus análisis y no puede escribir ninguno', async () => {
    const otro = await crearUsuario(db);
    await fila(otro, mes);
    const mio = await fila(u, mes);
    await actuarComo(db, u);
    await conRol(db, 'authenticated', async () => {
      expect(await todas(db, `select id from analisis_mensuales`)).toEqual([{ id: mio }]);
      await expect(db.query(`insert into analisis_mensuales (user_id, mes) values ($1, $2)`, [u, anterior]))
        .rejects.toThrow(/permission denied/);
      await expect(db.query(`update analisis_mensuales set regeneraciones = 0 where id = $1`, [mio]))
        .rejects.toThrow(/permission denied/);
      await expect(db.query(`delete from analisis_mensuales where id = $1`, [mio])).rejects.toThrow(/permission denied/);
    });
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select * from analisis_mensuales`)).rejects.toThrow(/permission denied/);
    });
  });

  it('valida mes (día 1), estado, regeneraciones y unicidad por mes', async () => {
    await expect(fila(u, dia(mes, 2))).rejects.toThrow(/check/);
    await expect(fila(u, mes, { estado: 'hecho' })).rejects.toThrow(/check/);
    await expect(fila(u, mes, { regeneraciones: 2 })).rejects.toThrow(/check/);
    await fila(u, mes);
    await expect(fila(u, mes)).rejects.toThrow(/duplicate key/);
  });

  it('updated_at se actualiza en cada cambio', async () => {
    const id = await fila(u, mes);
    await db.query(`update analisis_mensuales set updated_at = '2000-01-01' where id = $1`, [id]);
    await db.query(`update analisis_mensuales set estado = 'generando' where id = $1`, [id]);
    const { reciente } = await una<{ reciente: boolean }>(
      db, `select updated_at > now() - interval '1 minute' as reciente from analisis_mensuales where id = $1`, [id],
    );
    expect(reciente).toBe(true);
  });
});

describe('solicitar_regeneracion', () => {
  const pedir = async (m: string) => {
    await actuarComo(db, u);
    return conRol(db, 'authenticated', () => db.query(`select solicitar_regeneracion($1)`, [m]));
  };
  const limite = { code: 'P0001', message: 'limite_regeneracion' };
  const estado = async (user: string, m: string) => una(
    db, `select estado, regeneraciones, intentos, error_codigo from analisis_mensuales where user_id = $1 and mes = $2`, [user, m],
  );
  const insertar = (user: string, m: string, e: string) => db.query(
    `insert into analisis_mensuales (user_id, mes, estado, intentos) values ($1, $2, $3, 3)`, [user, m, e],
  );

  it('permite una regeneración de un análisis listo; la segunda falla con limite_regeneracion', async () => {
    await insertar(u, mes, 'listo');
    await pedir(mes);
    expect(await estado(u, mes)).toEqual({ estado: 'pendiente', regeneraciones: 1, intentos: 0, error_codigo: null });

    await db.query(`update analisis_mensuales set estado = 'listo' where user_id = $1`, [u]);
    await expect(pedir(mes)).rejects.toMatchObject(limite);
  });

  it('no desde error: un fallo se reintenta con reintentar_analisis y no gasta la regeneración', async () => {
    await insertar(u, mes, 'error');
    await expect(pedir(mes)).rejects.toMatchObject(limite);
    expect(await estado(u, mes)).toMatchObject({ estado: 'error', regeneraciones: 0 });
  });

  it('no mientras está pendiente o generándose, ni si no existe', async () => {
    await insertar(u, mes, 'pendiente');
    await insertar(u, anterior, 'generando');
    await expect(pedir(mes)).rejects.toMatchObject(limite);
    await expect(pedir(anterior)).rejects.toMatchObject(limite);
    await expect(pedir(actual)).rejects.toMatchObject(limite);
  });

  it('solo toca la fila del usuario de la sesión', async () => {
    const otro = await crearUsuario(db);
    await insertar(otro, mes, 'listo');
    await expect(pedir(mes)).rejects.toMatchObject(limite);
    expect(await estado(otro, mes)).toMatchObject({ estado: 'listo', regeneraciones: 0 });
  });

  it('anon no puede ejecutarla', async () => {
    await conRol(db, 'anon', async () => {
      await expect(db.query(`select solicitar_regeneracion($1)`, [mes])).rejects.toThrow(/permission denied/);
    });
  });
});
