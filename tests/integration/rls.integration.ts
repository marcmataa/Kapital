/** Aislamiento entre dos usuarios reales: RLS + claves foráneas compuestas (id, user_id). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completarOnboarding, crearUsuario, idDe, limpiar, sinStack, sql, type Usuario } from './apoyo.js';

afterAll(limpiar);

describe.skipIf(sinStack)('RLS entre usuarios', () => {
  let a: Usuario;
  let b: Usuario;
  let cuentaA: string;
  let movimientoA: string;

  beforeAll(async () => {
    [a, b] = await Promise.all([crearUsuario(), crearUsuario()]);
    await Promise.all([completarOnboarding(a), completarOnboarding(b)]);
    cuentaA = await idDe(a, 'cuentas', 'BBVA');
    const ocio = await idDe(a, 'categorias', 'Ocio');
    const { data, error } = await a.cliente.from('movimientos')
      .insert({ tipo: 'gasto', importe: '12.34', concepto: 'Prueba', cuenta_id: cuentaA, categoria_id: ocio })
      .select('id').single<{ id: string }>();
    if (error) throw new Error(error.message);
    movimientoA = data.id;
  });

  it('B no ve nada de A', async () => {
    for (const tabla of ['perfiles', 'cuentas', 'categorias', 'movimientos', 'tokens_api'] as const) {
      const { data, error } = await b.cliente.from(tabla).select('user_id').eq('user_id', a.id);
      expect(error, tabla).toBeNull();
      expect(data, tabla).toEqual([]);
    }
    const directo = await b.cliente.from('movimientos').select('id').eq('id', movimientoA);
    expect(directo.data).toEqual([]);
  });

  it('B no puede insertar filas a nombre de A', async () => {
    const { error } = await b.cliente.from('cuentas').insert({ user_id: a.id, nombre: 'Intrusa', tipo: 'efectivo' });
    expect(error?.code).toBe('42501');
  });

  it('B no puede apuntar un movimiento suyo en la cuenta de A', async () => {
    const ocioB = await idDe(b, 'categorias', 'Ocio');
    const { error } = await b.cliente.from('movimientos')
      .insert({ tipo: 'gasto', importe: '1.00', concepto: 'Cruce', cuenta_id: cuentaA, categoria_id: ocioB });
    expect(error).not.toBeNull();
    const [{ n } = { n: -1 }] = await sql()<{ n: number }[]>`
      select count(*)::int as n from movimientos where cuenta_id = ${cuentaA}`;
    expect(n).toBe(1);
  });

  it('B no puede modificar ni borrar las filas de A (0 filas afectadas)', async () => {
    const editar = await b.cliente.from('movimientos').update({ importe: '999.99' }).eq('id', movimientoA).select('id');
    expect(editar.data ?? []).toEqual([]);
    const borrar = await b.cliente.from('cuentas').delete().eq('id', cuentaA).select('id');
    expect(borrar.data ?? []).toEqual([]);

    const [fila] = await sql()<{ importe: string }[]>`select importe::text from movimientos where id = ${movimientoA}`;
    expect(fila?.importe).toBe('12.34');
    const cuenta = await sql()`select 1 from cuentas where id = ${cuentaA}`;
    expect(cuenta).toHaveLength(1);
  });
});
