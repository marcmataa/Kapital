import { describe, expect, it } from 'vitest';
import { lecturaAhorro } from './ahorro';

describe('lecturaAhorro (sección 3, cambio del 02/11/2026)', () => {
  it('sección 11: 1.508,00 € de ingresos y 22,5 % de ahorro se muestra como porcentaje', () => {
    expect(lecturaAhorro('1508.00', '22.5278514588859416')).toEqual({ tipo: 'porcentaje', porcentaje: '22.5278514588859416' });
  });

  it('sección 11 (02/11/2026): 100,00 € de ingresos y 350,00 € de gastos netos (−250 %) no se muestra', () => {
    expect(lecturaAhorro('100.00', '-250.0000')).toEqual({ tipo: 'fueraDeRango' });
  });

  it('los extremos −100 % y 100 % entran; un céntimo de porcentaje más allá, no', () => {
    expect(lecturaAhorro('500.00', '-100.0000').tipo).toBe('porcentaje');
    expect(lecturaAhorro('500.00', '100').tipo).toBe('porcentaje');
    expect(lecturaAhorro('500.00', '-100.0001').tipo).toBe('fueraDeRango');
    expect(lecturaAhorro('500.00', '100.01').tipo).toBe('fueraDeRango');
    expect(lecturaAhorro('500.00', '-99.9999').tipo).toBe('porcentaje');
    expect(lecturaAhorro('500.00', '0').tipo).toBe('porcentaje');
  });

  it('sin ingresos: «—» con explicación, aunque llegue un porcentaje', () => {
    expect(lecturaAhorro('0.00', null)).toEqual({ tipo: 'sinIngresos' });
    expect(lecturaAhorro('0.00', '-15.0')).toEqual({ tipo: 'sinIngresos' });
    expect(lecturaAhorro('120.00', null)).toEqual({ tipo: 'sinIngresos' });
  });

  it('un porcentaje que no es un decimal válido lanza (nunca se adivina)', () => {
    expect(() => lecturaAhorro('100.00', 'abc')).toThrow('porcentaje_invalido');
  });
});
