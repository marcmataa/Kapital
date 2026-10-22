/** Onboarding y límite de bancos a través de PostgREST con la sesión del usuario. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completarOnboarding, crearUsuario, limpiar, sinStack, type Usuario } from './apoyo.js';

afterAll(limpiar);

describe.skipIf(sinStack)('onboarding (PostgREST)', () => {
  let u: Usuario;
  beforeAll(async () => { u = await crearUsuario(); });

  it('el usuario no puede marcar su onboarding escribiendo en perfiles', async () => {
    const { error } = await u.cliente.from('perfiles').update({ onboarding_completado: true }).eq('user_id', u.id);
    expect(error?.code).toBe('42501');
  });

  it('completar_onboarding crea el banco principal, el efectivo y las categorías y marca el perfil', async () => {
    await completarOnboarding(u);

    const perfil = await u.cliente.from('perfiles').select('onboarding_completado').single();
    expect(perfil.data).toEqual({ onboarding_completado: true });

    const cuentas = await u.cliente
      .from('cuentas').select('nombre, tipo, es_principal, saldo_inicial::text').order('orden');
    expect(cuentas.error).toBeNull();
    expect(cuentas.data).toEqual([
      { nombre: 'BBVA', tipo: 'banco', es_principal: true, saldo_inicial: '1000.00' },
      { nombre: 'Efectivo', tipo: 'efectivo', es_principal: false, saldo_inicial: '50.00' },
    ]);

    const categorias = await u.cliente.from('categorias').select('nombre');
    expect(categorias.data).toHaveLength(8);
  });

  it('no se puede desmarcar el onboarding ni repetirlo', async () => {
    const desmarcar = await u.cliente.from('perfiles').update({ onboarding_completado: false }).eq('user_id', u.id);
    expect(desmarcar.error?.code).toBe('42501');

    const repetir = await u.cliente.rpc('completar_onboarding', {
      p_idioma: 'es', p_bancos: [{ entidad: 'ing', saldo: '0' }], p_efectivo: '0',
    });
    expect(repetir.error?.code).toBe('P0001');
  });

  it('hasta 5 bancos abiertos: el sexto se rechaza con 23514', async () => {
    for (const entidad of ['ing', 'santander', 'revolut', 'openbank']) {
      const { error } = await u.cliente.rpc('crear_banco', { p_entidad: entidad, p_nombre: null, p_color: null, p_saldo: '0' });
      expect(error).toBeNull();
    }
    const sexto = await u.cliente.rpc('crear_banco', { p_entidad: 'bankinter', p_nombre: null, p_color: null, p_saldo: '0' });
    expect(sexto.error?.code).toBe('23514');

    const bancos = await u.cliente.from('cuentas').select('id').eq('tipo', 'banco');
    expect(bancos.data).toHaveLength(5);
  });

  it('onboarding con 6 bancos de golpe: se rechaza entero', async () => {
    const otro = await crearUsuario();
    const bancos = ['bbva', 'ing', 'santander', 'revolut', 'openbank', 'bankinter'].map((entidad) => ({ entidad, saldo: '0' }));
    const r = await otro.cliente.rpc('completar_onboarding', { p_idioma: 'es', p_bancos: bancos, p_efectivo: '0' });
    expect(r.error?.code).toBe('22023');
    const cuentas = await otro.cliente.from('cuentas').select('id');
    expect(cuentas.data).toEqual([]);
  });
});
