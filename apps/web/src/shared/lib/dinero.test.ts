import { describe, expect, it } from 'vitest';
import {
  aCentimos,
  compararImportes,
  desdeCentimos,
  formatearEuros,
  formatearPorcentaje,
  importePositivo,
  parsearImporte,
} from './dinero';

// Intl usa espacios duros (U+00A0 / U+202F); se normalizan para comparar.
const ESPACIOS_DUROS = new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'g');
const n = (s: string) => s.replace(ESPACIOS_DUROS, ' ');

describe('parsearImporte (réplica de leer_importe)', () => {
  it.each([
    ['38,5', '38.50'],
    ['1.258,00', '1258.00'],
    ['1258.5', '1258.50'],
    ['-24', '24.00'],
    ['1.200', '1200.00'],
    ['1.200.000', '1200000.00'],
    ['1.5', '1.50'],
    ['12,345', '12.35'],
    ['1,005', '1.01'],
    ['1,004', '1.00'],
    ['0,10', '0.10'],
    ['  38,50 € ', '38.50'],
    ['.5', '0.50'],
    ['5.', '5.00'],
    ['007', '7.00'],
    ['1.508,00', '1508.00'],
    ['1168,28', '1168.28'],
  ])('%s → %s', (entrada, esperado) => {
    expect(parsearImporte(entrada)).toBe(esperado);
  });

  it.each(['', '   ', 'abc', '.', ',', '1.2.3', '1,2,3', '-', null, undefined])('rechaza %j', (entrada) => {
    expect(parsearImporte(entrada)).toBeNull();
  });

  it('no pierde precisión con importes grandes', () => {
    expect(parsearImporte('9.999.999.999,99')).toBe('9999999999.99');
    expect(parsearImporte('12345678901234567890,1')).toBe('12345678901234567890.10');
  });
});

describe('importePositivo', () => {
  it('acepta importes válidos', () => {
    expect(importePositivo('38,5')).toBe('38.50');
    expect(importePositivo('-24')).toBe('24.00');
    expect(importePositivo('9999999999,99')).toBe('9999999999.99');
  });
  it('rechaza cero, basura y desbordes de numeric(12,2)', () => {
    expect(importePositivo('0')).toBeNull();
    expect(importePositivo('0,004')).toBeNull();
    expect(importePositivo('abc')).toBeNull();
    expect(importePositivo('10000000000')).toBeNull();
  });
});

describe('céntimos', () => {
  it('convierte strings de la base a bigint exacto', () => {
    expect(aCentimos('1508.00')).toBe(150800n);
    expect(aCentimos('0.10') + aCentimos('0.20')).toBe(aCentimos('0.30'));
    expect(aCentimos('-339.72')).toBe(-33972n);
    expect(aCentimos('22.535')).toBe(2254n);
    expect(aCentimos('-0.005')).toBe(-1n);
    expect(aCentimos('7')).toBe(700n);
  });
  it('lanza con valores no decimales', () => {
    expect(() => aCentimos('1,5')).toThrow();
    expect(() => aCentimos('abc')).toThrow();
    expect(() => aCentimos('')).toThrow();
  });
  it('vuelve a string', () => {
    expect(desdeCentimos(150800n)).toBe('1508.00');
    expect(desdeCentimos(-5n)).toBe('-0.05');
    expect(desdeCentimos(0n)).toBe('0.00');
  });
  it('sección 11: 1.508,00 − 1.168,28 = 339,72', () => {
    expect(desdeCentimos(aCentimos('1508.00') - aCentimos('1168.28'))).toBe('339.72');
  });
  it('compara sin float', () => {
    expect(compararImportes('0.30', '0.3')).toBe(0);
    expect(compararImportes('-1.00', '0.00')).toBe(-1);
    expect(compararImportes('100.01', '100.00')).toBe(1);
  });
});

describe('formatearEuros', () => {
  it('sección 11 en español, con separador de miles siempre', () => {
    expect(n(formatearEuros('1508.00', 'es-ES'))).toBe('1.508,00 €');
    expect(n(formatearEuros('1168.28', 'es-ES'))).toBe('1.168,28 €');
    expect(n(formatearEuros('339.72', 'es-ES'))).toBe('339,72 €');
  });
  it('otros idiomas', () => {
    expect(n(formatearEuros('1508.00', 'en-GB'))).toBe('€1,508.00');
    expect(n(formatearEuros('1508.00', 'ca-ES'))).toBe('1.508,00 €');
  });
  it('es exacto (sin float)', () => {
    expect(n(formatearEuros('9999999999.99', 'es-ES'))).toBe('9.999.999.999,99 €');
    expect(n(formatearEuros('0.005', 'es-ES'))).toBe('0,01 €');
  });
  it('signos', () => {
    expect(n(formatearEuros('-30.00', 'es-ES'))).toBe('-30,00 €');
    expect(n(formatearEuros('24.00', 'es-ES', { signo: 'siempre' }))).toBe('+24,00 €');
    expect(n(formatearEuros('-24.00', 'es-ES', { signo: 'siempre' }))).toBe('-24,00 €');
    expect(n(formatearEuros('0.00', 'es-ES', { signo: 'siempre' }))).toBe('0,00 €');
    expect(n(formatearEuros('38.00', 'es-ES', { signo: 'negativo' }))).toBe('-38,00 €');
    expect(n(formatearEuros('0.00', 'es-ES', { signo: 'negativo' }))).toBe('0,00 €');
  });
  it('lanza con valores no decimales', () => {
    expect(() => formatearEuros('1,5', 'es-ES')).toThrow();
  });
});

describe('formatearPorcentaje', () => {
  it('sección 11: ahorro 22,5 %', () => {
    expect(n(formatearPorcentaje('22.5331564986737401', 'es-ES'))).toBe('22,5 %');
    expect(n(formatearPorcentaje('22.53', 'en-GB'))).toBe('22.5%');
  });
  it('mes sin ingresos: —', () => {
    expect(formatearPorcentaje(null, 'es-ES')).toBe('—');
    expect(formatearPorcentaje(undefined, 'es-ES')).toBe('—');
  });
  it('redondea a 1 decimal y admite signo', () => {
    expect(n(formatearPorcentaje('18.55', 'es-ES'))).toBe('18,6 %');
    expect(n(formatearPorcentaje('-7.34', 'es-ES'))).toBe('-7,3 %');
    expect(n(formatearPorcentaje('12.4', 'es-ES', { signo: 'siempre' }))).toBe('+12,4 %');
    expect(n(formatearPorcentaje('100', 'es-ES'))).toBe('100,0 %');
  });
});
