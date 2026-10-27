import { describe, expect, it } from 'vitest';
import {
  aCentimos,
  compararImportes,
  desdeCentimos,
  formatearEuros,
  formatearPorcentaje,
  importePositivo,
  normalizarCifrasTexto,
  parsearImporte,
  parsearImporteLocal,
  separadorDecimal,
  variacionPorcentual,
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

describe('parsearImporteLocal (según el idioma de la interfaz)', () => {
  it.each([
    ['1.258,50', '1258.50'],
    ['38,5', '38.50'],
    ['1.200', '1200.00'],
    ['1,000', '1.00'],
    ['38.5', '38.50'],
    ['0.99', '0.99'],
  ])('es/ca como leer_importe: %s → %s', (entrada, esperado) => {
    expect(parsearImporteLocal(entrada, 'es-ES')).toBe(esperado);
    expect(parsearImporteLocal(entrada, 'ca-ES')).toBe(esperado);
  });

  it.each([
    ['1,000', '1000.00'],
    ['1,234.56', '1234.56'],
    ['1,234,567.8', '1234567.80'],
    ['38.5', '38.50'],
    ['1258.50', '1258.50'],
    ['1.258', '1.26'],
    ['1000', '1000.00'],
    ['-24', '24.00'],
    ['£ 1,000.00 €', '1000.00'],
    ['.5', '0.50'],
  ])('en: la coma separa miles y el punto es decimal: %s → %s', (entrada, esperado) => {
    expect(parsearImporteLocal(entrada, 'en-GB')).toBe(esperado);
  });

  it.each(['1,5', '1,2345', '12,34', '1.258,50', '1,000,00', ',5', '1.2.3', 'abc', ''])(
    'en: rechaza entradas ambiguas o mal formadas en vez de adivinar: %j',
    (entrada) => {
      expect(parsearImporteLocal(entrada, 'en-GB')).toBeNull();
    },
  );

  it('lo que se envía a la base siempre es dddd.dd y se vuelve a leer igual en SQL', () => {
    const enviado = parsearImporteLocal('1,234.56', 'en-GB');
    expect(enviado).toBe('1234.56');
    expect(parsearImporte(enviado)).toBe('1234.56');
  });

  it('separador decimal por idioma', () => {
    expect(separadorDecimal('es-ES')).toBe(',');
    expect(separadorDecimal('ca-ES')).toBe(',');
    expect(separadorDecimal('en-GB')).toBe('.');
  });
});

describe('importePositivo', () => {
  it('en inglés, "1,000" son mil euros (no 1,00)', () => {
    expect(importePositivo('1,000', 'en-GB')).toBe('1000.00');
    expect(importePositivo('0.004', 'en-GB')).toBeNull();
  });

  it('acepta importes válidos', () => {
    expect(importePositivo('38,5', 'es-ES')).toBe('38.50');
    expect(importePositivo('-24', 'es-ES')).toBe('24.00');
    expect(importePositivo('9999999999,99', 'es-ES')).toBe('9999999999.99');
  });
  it('rechaza cero, basura y desbordes de numeric(12,2)', () => {
    expect(importePositivo('0', 'es-ES')).toBeNull();
    expect(importePositivo('0,004', 'es-ES')).toBeNull();
    expect(importePositivo('abc', 'es-ES')).toBeNull();
    expect(importePositivo('10000000000', 'es-ES')).toBeNull();
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

describe('variacionPorcentual (sección 8)', () => {
  it('(Actual − Anterior) / |Anterior| × 100 con 4 decimales exactos', () => {
    expect(variacionPorcentual('110.00', '100.00')).toBe('10.0000');
    expect(variacionPorcentual('90.00', '100.00')).toBe('-10.0000');
    expect(variacionPorcentual('2.00', '3.00')).toBe('-33.3333');
    expect(variacionPorcentual('1.00', '3.00')).toBe('-66.6667');
  });

  it('usa el valor absoluto del anterior: de −100 a −50 es una mejora del 50 %', () => {
    expect(variacionPorcentual('-50.00', '-100.00')).toBe('50.0000');
  });

  it('base cero o sin periodo anterior → null («Sin datos del mes anterior», caso de la sección 11)', () => {
    expect(variacionPorcentual('1508.00', '0.00')).toBeNull();
    expect(variacionPorcentual('1508.00', null)).toBeNull();
    expect(variacionPorcentual(null, '100.00')).toBeNull();
  });

  it('se muestra con 1 decimal', () => {
    expect(n(formatearPorcentaje(variacionPorcentual('1.00', '3.00'), 'es-ES'))).toBe('-66,7 %');
  });
});

describe('normalizarCifrasTexto (texto de la IA)', () => {
  it('es / ca: punto decimal seguido de % o € → coma', () => {
    expect(normalizarCifrasTexto('El ocio supuso el 23.4 % del gasto.', 'es-ES')).toBe('El ocio supuso el 23,4 % del gasto.');
    expect(normalizarCifrasTexto('Gastaste 38.50 € y luego 9.5€.', 'ca-ES')).toBe('Gastaste 38,50 € y luego 9,5€.');
    expect(normalizarCifrasTexto('un 12.3%', 'es-ES')).toBe('un 12,3%');
  });

  it('no toca los miles, los decimales sin unidad ni las cifras ya correctas', () => {
    const texto = 'Ingresos de 1.258 €, 1.508,00 € netos, versión 2.5 y el 22,5 %.';
    expect(normalizarCifrasTexto(texto, 'es-ES')).toBe(texto);
  });

  it('en inglés no cambia nada', () => {
    expect(normalizarCifrasTexto('Leisure was 23.4% of spending.', 'en-GB')).toBe('Leisure was 23.4% of spending.');
  });
});
