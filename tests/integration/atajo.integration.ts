/**
 * Atajo del iPhone de punta a punta: el usuario crea su token con sesión y el
 * atajo llama a registrar_movimiento solo con la clave anon y ese token.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clienteAnon, completarOnboarding, crearUsuario, limpiar, sinStack, type Usuario } from './apoyo.js';

afterAll(limpiar);

interface Respuesta { ok: boolean; id?: string; error?: string; mensaje?: string }

describe.skipIf(sinStack)('atajo del iPhone (registrar_movimiento con la clave anon)', () => {
  let u: Usuario;
  let anon: SupabaseClient;
  let token: string;

  beforeAll(async () => {
    u = await crearUsuario();
    await completarOnboarding(u);
    anon = clienteAnon();
    const { data, error } = await u.cliente.rpc('crear_token', { p_nombre: 'iPhone de prueba' });
    if (error || typeof data !== 'string') throw new Error(`crear_token: ${error?.message ?? 'sin token'}`);
    token = data;
  });

  async function atajo(args: Record<string, string>): Promise<Respuesta> {
    const { data, error } = await anon.rpc('registrar_movimiento', { token, ...args });
    expect(error).toBeNull();
    return data as Respuesta;
  }

  it('crear_token devuelve el token una vez y en la base solo queda su hash', async () => {
    expect(token).toMatch(/^mf_[0-9a-f]{64}$/);
    const { data } = await u.cliente.from('tokens_api').select('token_hash, revocado');
    expect(data).toHaveLength(1);
    expect(data?.[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data?.[0]?.token_hash).not.toBe(token);
  });

  it('registra un gasto con importe en formato español en la cuenta principal', async () => {
    const r = await atajo({ tipo: 'Gasto', importe: '38,5', concepto: 'Cena', categoria: 'restaurantes' });
    expect(r).toMatchObject({ ok: true, mensaje: '✅ Gasto de 38,50 € · Restaurantes' });

    const { data } = await u.cliente.from('movimientos')
      .select('importe::text, tipo, origen, cuentas!movimientos_cuenta_id_user_id_fkey(nombre)')
      .eq('id', r.id ?? '').single();
    expect(data).toMatchObject({ importe: '38.50', tipo: 'gasto', origen: 'atajo', cuentas: { nombre: 'BBVA' } });
  });

  it('con un token falso responde un error legible', async () => {
    const { data } = await anon.rpc('registrar_movimiento', { token: 'mf_falso', tipo: 'gasto', importe: '1' });
    expect(data).toEqual({ ok: false, error: 'Token no válido. Revisa el token del atajo.' });
  });

  it('la clave anon no lee tablas ni llama a otras funciones', async () => {
    const tabla = await anon.from('movimientos').select('id');
    expect(tabla.error?.code).toBe('42501');
    const funcion = await anon.rpc('patrimonio', { p_fecha: '2026-10-01' });
    expect(funcion.error?.code).toBe('42501');
    const token2 = await anon.rpc('crear_token', { p_nombre: 'x' });
    expect(token2.error?.code).toBe('42501');
  });

  it('un token revocado deja de funcionar y no se puede reactivar', async () => {
    const revocar = await u.cliente.from('tokens_api').update({ revocado: true }).eq('revocado', false).select('id');
    expect(revocar.error).toBeNull();
    expect(revocar.data).toHaveLength(1);

    const r = await atajo({ tipo: 'gasto', importe: '1', categoria: 'Ocio' });
    expect(r.ok).toBe(false);

    const reactivar = await u.cliente.from('tokens_api').update({ revocado: false }).eq('revocado', true);
    expect(reactivar.error?.code).toBe('23514');

    const hash = await u.cliente.from('tokens_api').update({ token_hash: '0'.repeat(64) }).eq('revocado', true);
    expect(hash.error?.code).toBe('42501');
  });
});
