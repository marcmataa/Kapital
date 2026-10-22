import { describe, expect, it } from 'vitest';
import { mesDeParametro, mesesDisponibles, parametroDeMes } from './periodos';

describe('mesDeParametro / parametroDeMes (?mes=YYYY-MM)', () => {
  it('acepta YYYY-MM y devuelve el día 1', () => {
    expect(mesDeParametro('2026-09')).toBe('2026-09-01');
    expect(parametroDeMes('2026-09-01')).toBe('2026-09');
  });

  it.each([null, undefined, '', '2026-13', '2026-00', '2026-9', '2026-09-01', 'septiembre', '2026-09x'])(
    'rechaza %s',
    (valor) => {
      expect(mesDeParametro(valor)).toBeNull();
    },
  );
});

describe('mesesDisponibles (rango del selector de mes)', () => {
  it('del mes en curso al de la primera cuenta, ambos incluidos', () => {
    expect(mesesDisponibles('2026-10-19', '2026-08-15')).toEqual(['2026-10-01', '2026-09-01', '2026-08-01']);
  });

  it('sin cuentas, o con la primera en el futuro, solo el mes en curso', () => {
    expect(mesesDisponibles('2026-10-19', null)).toEqual(['2026-10-01']);
    expect(mesesDisponibles('2026-10-19', '2026-11-01')).toEqual(['2026-10-01']);
  });
});
