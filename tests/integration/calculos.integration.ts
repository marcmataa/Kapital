/**
 * Importes exactos a través de PostgREST (siempre pedidos como ::text) y caso de
 * balance de la sección 11 de docs/reglas-financieras.md (cifras del documento).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idDe, limpiar, sinStack, type Usuario } from './apoyo.js';

afterAll(limpiar);

interface Resumen { ingresos: string; gastos: string; devoluciones: string; gastos_netos: string; balance: string; ahorro_pct: string | null }
const COLUMNAS_RESUMEN = 'ingresos::text, gastos::text, devoluciones::text, gastos_netos::text, balance::text, ahorro_pct::text';

/** Usuario con una cuenta y las categorías del caso (inserción directa, sin onboarding). */
async function preparar(u: Usuario, saldoInicial: string, fechaInicial: string) {
  const cuenta = await u.cliente.from('cuentas')
    .insert({ nombre: 'Banco', tipo: 'banco', saldo_inicial: saldoInicial, fecha_inicial: fechaInicial, es_principal: true })
    .select('id').single<{ id: string }>();
  if (cuenta.error) throw new Error(cuenta.error.message);
  const categorias = await u.cliente.from('categorias').insert([
    { nombre: 'Nómina', tipo: 'ingreso' },
    { nombre: 'Otros ingresos', tipo: 'ingreso' },
    { nombre: 'Restaurantes', tipo: 'gasto' },
    { nombre: 'Ocio', tipo: 'gasto' },
  ]);
  if (categorias.error) throw new Error(categorias.error.message);
  return cuenta.data.id;
}

async function movimientos(u: Usuario, cuenta: string, filas: { tipo: string; importe: string; fecha: string; categoria: string }[]) {
  const ids = new Map<string, string>();
  for (const f of filas) if (!ids.has(f.categoria)) ids.set(f.categoria, await idDe(u, 'categorias', f.categoria));
  const { error } = await u.cliente.from('movimientos').insert(filas.map((f) => ({
    tipo: f.tipo, importe: f.importe, fecha: f.fecha, concepto: 'Caso de prueba', cuenta_id: cuenta, categoria_id: ids.get(f.categoria),
  })));
  if (error) throw new Error(error.message);
}

describe.skipIf(sinStack)('importes exactos', () => {
  let u: Usuario;
  beforeAll(async () => {
    u = await crearUsuario();
    const cuenta = await preparar(u, '0', '2026-01-01');
    await movimientos(u, cuenta, [
      { tipo: 'gasto', importe: '0.10', fecha: '2026-03-02', categoria: 'Ocio' },
      { tipo: 'gasto', importe: '0.20', fecha: '2026-03-03', categoria: 'Ocio' },
    ]);
  });

  it("select('importe::text') devuelve el string exacto", async () => {
    const { data, error } = await u.cliente.from('movimientos').select('importe::text').order('fecha');
    expect(error).toBeNull();
    expect(data).toEqual([{ importe: '0.10' }, { importe: '0.20' }]);
  });

  it('0,10 + 0,20 = 0,30 en resumen_periodo, sin ahorro si no hay ingresos', async () => {
    const { data, error } = await u.cliente
      .rpc('resumen_periodo', { p_desde: '2026-03-01', p_hasta: '2026-03-31' })
      .select(COLUMNAS_RESUMEN).single<Resumen>();
    expect(error).toBeNull();
    expect(data).toMatchObject({ gastos: '0.30', gastos_netos: '0.30', balance: '-0.30', ahorro_pct: null });
  });

  it('la base rechaza importes negativos o cero', async () => {
    const cuenta = await idDe(u, 'cuentas', 'Banco');
    const ocio = await idDe(u, 'categorias', 'Ocio');
    for (const importe of ['0', '-1.00']) {
      const { error } = await u.cliente.from('movimientos')
        .insert({ tipo: 'gasto', importe, fecha: '2026-03-04', concepto: 'Mal', cuenta_id: cuenta, categoria_id: ocio });
      expect(error?.code, importe).toBe('23514');
    }
  });
});

describe.skipIf(sinStack)('sección 11 · balance de septiembre', () => {
  let u: Usuario;
  beforeAll(async () => {
    u = await crearUsuario();
    const cuenta = await preparar(u, '1000.00', '2026-09-01');
    await movimientos(u, cuenta, [
      { tipo: 'ingreso', importe: '1258.00', fecha: '2026-09-01', categoria: 'Nómina' },
      { tipo: 'ingreso', importe: '250.00', fecha: '2026-09-15', categoria: 'Otros ingresos' },
      { tipo: 'gasto', importe: '1000.00', fecha: '2026-09-05', categoria: 'Restaurantes' },
      { tipo: 'gasto', importe: '198.28', fecha: '2026-09-20', categoria: 'Ocio' },
      { tipo: 'devolucion', importe: '30.00', fecha: '2026-09-21', categoria: 'Ocio' },
      // Fuera de septiembre: no cuenta en el balance
      { tipo: 'gasto', importe: '99.99', fecha: '2026-10-01', categoria: 'Ocio' },
    ]);
  });

  it('ingresos 1.508,00 € y gastos netos 1.168,28 € → balance 339,72 € y ahorro 22,5 %', async () => {
    const { data, error } = await u.cliente
      .rpc('resumen_periodo', { p_desde: '2026-09-01', p_hasta: '2026-09-30' })
      .select(COLUMNAS_RESUMEN).single<Resumen>();
    expect(error).toBeNull();
    expect(data).toMatchObject({ ingresos: '1508.00', gastos: '1198.28', devoluciones: '30.00', gastos_netos: '1168.28', balance: '339.72' });
    // 339,72 / 1.508,00 × 100 = 22,5278…: precisión completa en la base, 1 decimal al mostrar
    expect(data?.ahorro_pct).toMatch(/^22\.5278/);
  });

  it('serie_patrimonio: valor al cierre de cada día, nada antes de la primera cuenta', async () => {
    const { data, error } = await u.cliente
      .rpc('serie_patrimonio', { p_desde: '2026-08-30', p_hasta: '2026-09-02', p_hoy: '2026-10-21' })
      .select('fecha::text, patrimonio::text, provisional');
    expect(error).toBeNull();
    expect(data).toEqual([
      { fecha: '2026-09-01', patrimonio: '2258.00', provisional: false },
      { fecha: '2026-09-02', patrimonio: '2258.00', provisional: false },
    ]);

    const cierre = await u.cliente
      .rpc('serie_patrimonio', { p_desde: '2026-09-30', p_hasta: '2026-10-01', p_hoy: '2026-10-01' })
      .select('fecha::text, patrimonio::text, provisional');
    // 1.000 + 1.508 − 1.198,28 + 30 = 1.339,72; el 1 de octubre resta 99,99 y es «hoy» (provisional)
    expect(cierre.data).toEqual([
      { fecha: '2026-09-30', patrimonio: '1339.72', provisional: false },
      { fecha: '2026-10-01', patrimonio: '1239.73', provisional: true },
    ]);
  });
});
