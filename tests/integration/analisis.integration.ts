/** Análisis mensual: el usuario solo lee el suyo; las escrituras son de la Edge Function (service_role). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clienteAdmin, clienteAnon, completarOnboarding, crearUsuario, limpiar, sinStack, sql, type Usuario } from './apoyo.js';

afterAll(limpiar);

describe.skipIf(sinStack)('análisis mensual', () => {
  let a: Usuario;
  let b: Usuario;

  beforeAll(async () => {
    [a, b] = await Promise.all([crearUsuario(), crearUsuario()]);
    await completarOnboarding(a);
    // Lo que haría la Edge Function: escribir como un rol que salta RLS.
    await sql()`insert into analisis_mensuales (user_id, mes, estado, contenido)
                values (${a.id}, '2026-09-01', 'listo', ${sql().json({ resumen: 'Prueba' })})`;
  });

  it('cada usuario lee solo su análisis', async () => {
    const propio = await a.cliente.from('analisis_mensuales').select('mes, estado');
    expect(propio.data).toEqual([{ mes: '2026-09-01', estado: 'listo' }]);
    const ajeno = await b.cliente.from('analisis_mensuales').select('id');
    expect(ajeno.data).toEqual([]);
  });

  it('el usuario no puede insertar, editar ni borrar análisis', async () => {
    const insertar = await a.cliente.from('analisis_mensuales').insert({ user_id: a.id, mes: '2026-08-01' });
    expect(insertar.error?.code).toBe('42501');
    const editar = await a.cliente.from('analisis_mensuales').update({ estado: 'pendiente' }).eq('user_id', a.id);
    expect(editar.error?.code).toBe('42501');
    const borrar = await a.cliente.from('analisis_mensuales').delete().eq('user_id', a.id);
    expect(borrar.error?.code).toBe('42501');
  });

  it('datos_analisis devuelve los importes como strings', async () => {
    const { data, error } = await a.cliente.rpc('datos_analisis', { p_mes: '2026-10-01' });
    expect(error).toBeNull();
    const datos = data as { resumen: Record<string, string | null>; variacion: Record<string, string | null> };
    expect(datos.resumen).toMatchObject({ ingresos: '0.00', gastos: '0.00', balance: '0.00', ahorro_pct: null });
    expect(datos.variacion.patrimonio_final).toBe('1050.00');
  });

  it('datos_analisis_usuario solo lo puede llamar service_role', async () => {
    const args = { p_user: a.id, p_mes: '2026-10-01' };
    expect((await a.cliente.rpc('datos_analisis_usuario', args)).error?.code).toBe('42501');
    expect((await clienteAnon().rpc('datos_analisis_usuario', args)).error?.code).toBe('42501');

    const admin = await clienteAdmin().rpc('datos_analisis_usuario', args);
    expect(admin.error).toBeNull();
    expect((admin.data as { mes: string }).mes).toBe('2026-10-01');
  });
});
