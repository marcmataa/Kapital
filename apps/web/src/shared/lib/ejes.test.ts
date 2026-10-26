import { describe, expect, it } from 'vitest';
import { escalaDeImportes, escalaRedonda, formatearEurosEje, posicionEnEje, tramoBarra } from './ejes';

const euros = (ticks: bigint[]) => ticks.map((c) => Number(c / 100n));

describe('escalaRedonda', () => {
  it('0–270 € → 0 / 100 / 200 / 300 €', () => {
    const e = escalaRedonda(0n, 27000n);
    expect(euros(e.ticks)).toEqual([0, 100, 200, 300]);
    expect(e.paso).toBe(10000n);
  });

  it('el máximo exacto no añade una marca de más: 0–300 € → 0 / 100 / 200 / 300 €', () => {
    expect(euros(escalaRedonda(0n, 30000n).ticks)).toEqual([0, 100, 200, 300]);
  });

  it('1.168,28 € → 0 / 500 / 1.000 / 1.500 €', () => {
    expect(euros(escalaDeImportes(['1168.28', '80.00']).ticks)).toEqual([0, 500, 1000, 1500]);
  });

  it('nunca más de 4 marcas y siempre a la misma distancia', () => {
    for (const [lo, hi] of [
      [0n, 1n],
      [0n, 999n],
      [0n, 123456n],
      [-5000n, 150800n],
      [-987654n, 12n],
      [0n, 999999999999n],
    ] as const) {
      const e = escalaRedonda(lo, hi);
      expect(e.ticks.length).toBeGreaterThanOrEqual(2);
      expect(e.ticks.length).toBeLessThanOrEqual(4);
      expect(e.min).toBeLessThanOrEqual(lo);
      expect(e.max).toBeGreaterThanOrEqual(hi);
      for (let i = 1; i < e.ticks.length; i++) expect((e.ticks[i] ?? 0n) - (e.ticks[i - 1] ?? 0n)).toBe(e.paso);
      expect(e.paso % 100n).toBe(0n); // euros enteros
    }
  });

  it('con negativos el eje cruza el 0 y el 0 es una marca', () => {
    const e = escalaDeImportes(['1508.00', '1168.28', '-80.00']);
    expect(euros(e.ticks)).toEqual([-1000, 0, 1000, 2000]);
    expect(e.ticks).toContain(0n);
  });

  it('todo negativo: el eje llega al 0 por arriba', () => {
    expect(euros(escalaDeImportes(['-50.00', '-20.00']).ticks)).toEqual([-60, -40, -20, 0]);
  });

  it('sin el cero (patrimonio): valores redondos ajustados a los datos', () => {
    const e = escalaRedonda(180000n, 245832n, { incluirCero: false });
    expect(euros(e.ticks)).toEqual([1500, 2000, 2500]);
  });

  it('serie a 0 o sin datos: eje 0–10 € (no divide por cero)', () => {
    expect(euros(escalaDeImportes([]).ticks)).toEqual([0, 5, 10]);
    expect(euros(escalaDeImportes(['0.00', null]).ticks)).toEqual([0, 5, 10]);
  });

  it('serie plana sin cero: un margen alrededor del valor', () => {
    const e = escalaRedonda(250000n, 250000n, { incluirCero: false });
    expect(e.min).toBeLessThanOrEqual(250000n);
    expect(e.max).toBeGreaterThan(250000n);
  });
});

describe('posicionEnEje y tramoBarra', () => {
  const e = escalaRedonda(-10000n, 30000n);
  it('la escala de prueba es -200 / 0 / 200 / 400 €', () => {
    expect(euros(e.ticks)).toEqual([-200, 0, 200, 400]);
  });

  it('posición de 0 a 1 desde abajo, acotada', () => {
    expect(posicionEnEje(0n, e)).toBeCloseTo(1 / 3, 5);
    expect(posicionEnEje('400.00', e)).toBe(1);
    expect(posicionEnEje('9999.00', e)).toBe(1);
    expect(posicionEnEje('-9999.00', e)).toBe(0);
  });

  it('una barra positiva sale del cero hacia arriba y una negativa hacia abajo', () => {
    const cero = (1 / 3) * 100;
    const pos = tramoBarra('200.00', e);
    expect(pos.abajo).toBeCloseTo(cero);
    expect(pos.alto).toBeCloseTo(100 / 3);
    const neg = tramoBarra('-100.00', e);
    expect(neg.abajo + neg.alto).toBeCloseTo(cero);
    expect(neg.alto).toBeCloseTo(100 / 6);
  });

  it('un importe pequeño distinto de 0 se ve; el 0 no tiene altura', () => {
    expect(tramoBarra('0.01', e).alto).toBe(0.75);
    expect(tramoBarra('0.00', e).alto).toBe(0);
  });
});

describe('formatearEurosEje', () => {
  it('euros enteros sin decimales', () => {
    expect(formatearEurosEje(150000n, 'es-ES').replace(/\s/g, ' ')).toBe('1.500 €');
    expect(formatearEurosEje(-100000n, 'es-ES').replace(/\s/g, ' ')).toBe('-1.000 €');
    expect(formatearEurosEje(0n, 'en-GB')).toBe('€0');
  });
});
