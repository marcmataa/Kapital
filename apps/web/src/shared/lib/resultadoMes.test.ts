import { describe, expect, it } from 'vitest';
import { categoriasDelResultado, importeAbsoluto, sentidoResultado } from './resultadoMes';

const cat = (id: string, gasto: string) => ({ id, nombre: id, color: '#000000', gasto });

describe('categoriasDelResultado', () => {
  it('de mayor a menor, máximo 5 sueltas y el resto sumado al céntimo; % sobre las positivas (sección 8)', () => {
    const r = categoriasDelResultado([
      cat('F', '10.00'),
      cat('A', '300.00'),
      cat('B', '200.00'),
      cat('C', '150.00'),
      cat('D', '100.00'),
      cat('E', '30.01'),
      cat('G', '9.99'),
      cat('N', '-20.00'),
      cat('Z', '0.00'),
    ]);
    expect(r.principales.map((c) => [c.id, c.porcentaje])).toEqual([
      ['A', '37.5000'],
      ['B', '25.0000'],
      ['C', '18.7500'],
      ['D', '12.5000'],
      ['E', '3.7513'],
    ]);
    expect(r.resto).toEqual({ gasto: '19.99', porcentaje: '2.4988', nombres: ['F', 'G'] });
    expect(r.negativas.map((c) => [c.id, c.porcentaje])).toEqual([['N', null]]);
  });

  it('con 5 o menos, sin grupo; sin gasto positivo, sin porcentajes', () => {
    expect(categoriasDelResultado([cat('A', '1.00'), cat('B', '2.00')]).resto).toBeNull();
    expect(categoriasDelResultado([cat('N', '-5.00')])).toEqual({ principales: [], resto: null, negativas: [{ ...cat('N', '-5.00'), porcentaje: null }] });
  });
});

describe('sentidoResultado / importeAbsoluto', () => {
  it('queda, falta o cero; el importe sin signo, exacto', () => {
    expect(sentidoResultado('339.72')).toBe('queda');
    expect(sentidoResultado('-204.13')).toBe('falta');
    expect(sentidoResultado('0.00')).toBe('cero');
    expect(importeAbsoluto('-204.13')).toBe('204.13');
  });
});
