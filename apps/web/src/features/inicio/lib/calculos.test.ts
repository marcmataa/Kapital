import { describe, expect, it } from 'vitest';
import {
  escalaEje,
  formatearDiaMes,
  formatearEurosEje,
  fraccion,
  porcentajeSobre,
  progresoBarra,
  restarImportes,
} from './calculos';

const pasos = (ticks: bigint[]) => ticks.slice(1).map((v, i) => v - (ticks[i] ?? 0n));

describe('escalaEje', () => {
  it('ajusta el eje a los datos con escalones redondos e iguales (no desde 0)', () => {
    // Patrimonio de la maqueta: de 1.800,00 € a 2.458,32 €.
    const e = escalaEje(180000n, 245832n, 5);
    expect(e.ticks).toEqual([180000n, 200000n, 220000n, 240000n, 260000n]);
    expect(e.paso).toBe(20000n);
    expect(e.min).toBeLessThanOrEqual(180000n);
    expect(e.max).toBeGreaterThanOrEqual(245832n);
  });

  it('todos los escalones miden lo mismo y son euros enteros', () => {
    for (const [min, max] of [
      [12345n, 98765n],
      [1n, 7n],
      [-50000n, 120000n],
      [99999999n, 100000001n],
    ] as const) {
      const e = escalaEje(min, max, 5);
      expect(new Set(pasos(e.ticks)).size).toBe(1);
      expect(e.ticks.every((t) => t % 100n === 0n)).toBe(true);
      expect(e.min).toBeLessThanOrEqual(min);
      expect(e.max).toBeGreaterThanOrEqual(max);
      expect(e.ticks.length).toBeGreaterThanOrEqual(2);
      expect(e.ticks.length).toBeLessThanOrEqual(7);
    }
  });

  it('usa pasos 1, 2 o 5 × 10^n', () => {
    expect(escalaEje(0n, 100000n, 5).paso).toBe(50000n); // 0..1.000 € → 500 €
    expect(escalaEje(100000n, 130000n, 5).paso).toBe(10000n); // 300 € de rango → 100 €
  });

  it('una serie plana tiene un rango alrededor del valor', () => {
    const e = escalaEje(250000n, 250000n, 5);
    expect(e.min).toBeLessThan(250000n);
    expect(e.max).toBeGreaterThan(250000n);
    expect(new Set(pasos(e.ticks)).size).toBe(1);
  });

  it('funciona con valores negativos (deudas)', () => {
    const e = escalaEje(-123456n, -23456n, 5);
    expect(e.min).toBeLessThanOrEqual(-123456n);
    expect(e.max).toBeGreaterThanOrEqual(-23456n);
    expect(e.ticks.every((t) => t % 100n === 0n)).toBe(true);
  });
});

describe('formatearEurosEje', () => {
  it('muestra euros sin decimales', () => {
    expect(formatearEurosEje(260000n, 'es-ES').replace(/\s/g, ' ')).toBe('2.600 €');
    expect(formatearEurosEje(-50000n, 'es-ES').replace(/\s/g, ' ')).toBe('-500 €');
  });
});

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
