import { describe, expect, it } from 'vitest';
import {
  formatearDiaMes,
  fraccion,
  porcentajeSobre,
  progresoBarra,
  restarImportes,
} from './calculos';

describe('porcentajeSobre', () => {
  it('calcula el % sobre los gastos netos con 4 decimales exactos', () => {
    expect(porcentajeSobre('40.00', '100.00')).toBe('40.0000');
    expect(porcentajeSobre('1.00', '3.00')).toBe('33.3333');
    expect(porcentajeSobre('2.00', '3.00')).toBe('66.6667');
  });

  it('admite categorías en negativo y total no positivo → null', () => {
    expect(porcentajeSobre('-30.00', '10.00')).toBe('-300.0000');
    expect(porcentajeSobre('10.00', '0.00')).toBeNull();
    expect(porcentajeSobre('10.00', '-5.00')).toBeNull();
  });
});

describe('restarImportes / progresoBarra / fraccion', () => {
  it('resta exacta en céntimos', () => {
    expect(restarImportes('0.30', '0.10')).toBe('0.20');
    expect(restarImportes('1950.00', '2310.00')).toBe('-360.00');
  });

  it('progreso acotado a 0..100', () => {
    expect(progresoBarra('342.00', '500.00')).toBe(68);
    expect(progresoBarra('-15.00', '500.00')).toBe(0);
    expect(progresoBarra('215.00', '200.00')).toBe(100);
  });

  it('fracción para píxeles', () => {
    expect(fraccion(50n, 0n, 100n)).toBe(0.5);
    expect(fraccion(7n, 7n, 7n)).toBe(0.5);
  });
});

describe('formatearDiaMes', () => {
  it('día y mes corto', () => {
    expect(formatearDiaMes('2026-10-15', 'es-ES')).toBe('15 oct');
    expect(formatearDiaMes('2026-09-30', 'es-ES')).toBe('30 sept');
  });
});
