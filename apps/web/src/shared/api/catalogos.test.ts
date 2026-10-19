import { describe, expect, it, vi } from 'vitest';
import { crearStore } from '@/app/store';

const consultas = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('@/shared/lib/supabase', () => {
  const resultado = (tabla: string, columnas: string) => {
    consultas.select(tabla, columnas);
    if (tabla === 'cuentas') {
      return {
        order: () =>
          Promise.resolve({
            data: [
              { id: 'a', nombre: 'CaixaBank', saldo_inicial: '1258.50' },
              { id: 'b', nombre: 'Cerrada', saldo_inicial: '0.00' },
            ],
            error: null,
          }),
      };
    }
    return Promise.resolve({ data: [{ id: 'a', valor: '1300.10' }], error: null });
  };
  return { supabase: { from: (tabla: string) => ({ select: (c: string) => resultado(tabla, c) }) } };
});

const { catalogosApi, aNumeric } = await import('./catalogos');

describe('catalogosApi.listarCuentas', () => {
  it('pide los importes como texto y une el valor de hoy de v_saldos', async () => {
    const store = crearStore();
    const r = await store.dispatch(catalogosApi.endpoints.listarCuentas.initiate());

    expect(consultas.select).toHaveBeenCalledWith('cuentas', expect.stringContaining('saldo_inicial::text'));
    expect(consultas.select).toHaveBeenCalledWith('v_saldos', 'id, valor::text');
    expect(r.data).toEqual([
      { id: 'a', nombre: 'CaixaBank', saldo_inicial: '1258.50', valor: '1300.10' },
      { id: 'b', nombre: 'Cerrada', saldo_inicial: '0.00', valor: null },
    ]);
  });
});

describe('aNumeric', () => {
  it('no convierte el importe: lo pasa tal cual a la base', () => {
    expect(aNumeric('0.10')).toBe('0.10');
  });
});
