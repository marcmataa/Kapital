import { describe, expect, it } from 'vitest';
import { mediaMensual, porcentajeDe, repartirCategorias, repartirIngresos, serieGastoDiario } from './agregaciones';
import { hayInteranual, mesesDisponibles, periodosComparacion, rangoInteranual, ultimosMeses } from './periodos';

describe('periodosComparacion (sección 8: misma longitud)', () => {
  it('mes en curso: 1..hoy contra 1..d del mes anterior', () => {
    expect(periodosComparacion('2026-10-01', '2026-10-19', '2026-01-01')).toEqual({
      actual: { desde: '2026-10-01', hasta: '2026-10-19' },
      anterior: { desde: '2026-09-01', hasta: '2026-09-19' },
      enCurso: true,
    });
  });

  it('31/10 se compara con 30/09 y 29/03/2027 con 28/02/2027', () => {
    expect(periodosComparacion('2026-10-01', '2026-10-31', '2026-01-01').anterior).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
    });
    expect(periodosComparacion('2027-03-01', '2027-03-29', '2026-01-01').anterior).toEqual({
      desde: '2027-02-01',
      hasta: '2027-02-28',
    });
  });

  it('mes cerrado: mes completo contra mes completo', () => {
    expect(periodosComparacion('2026-09-01', '2026-10-19', '2026-01-01')).toEqual({
      actual: { desde: '2026-09-01', hasta: '2026-09-30' },
      anterior: { desde: '2026-08-01', hasta: '2026-08-31' },
      enCurso: false,
    });
  });

  it('sin datos del mes anterior: no hay periodo con el que comparar', () => {
    expect(periodosComparacion('2026-10-01', '2026-10-19', '2026-10-05').anterior).toBeNull();
    expect(periodosComparacion('2026-10-01', '2026-10-19', null).anterior).toBeNull();
  });

  it('periodo anterior parcial (datos desde el 25/09): el 27/10 no hay porcentaje', () => {
    // 1–27 sept empieza antes del primer día con datos: no tiene la misma longitud.
    expect(periodosComparacion('2026-10-01', '2026-10-27', '2026-09-25').anterior).toBeNull();
    // Mes cerrado: octubre completo contra septiembre, que empezó a mitad → tampoco.
    expect(periodosComparacion('2026-10-01', '2026-11-03', '2026-09-25').anterior).toBeNull();
    // Datos desde el día 1 exacto: sí hay comparación.
    expect(periodosComparacion('2026-10-01', '2026-10-27', '2026-09-01').anterior).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-27',
    });
  });
});

describe('meses e interanual', () => {
  it('meses seleccionables desde la primera cuenta hasta el mes en curso', () => {
    expect(mesesDisponibles('2026-10-19', '2026-08-12')).toEqual(['2026-10-01', '2026-09-01', '2026-08-01']);
    expect(mesesDisponibles('2026-10-19', null)).toEqual(['2026-10-01']);
  });

  it('últimos meses sin pasar del primer mes con datos', () => {
    expect(ultimosMeses('2026-10-01', 6, '2026-08-12')).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
  });

  it('interanual solo con al menos 12 meses de datos', () => {
    expect(hayInteranual('2026-10-01', '2026-10-19', '2026-08-01')).toBe(false);
    expect(hayInteranual('2026-10-01', '2026-10-19', '2025-11-01')).toBe(false); // falta oct-2025
    expect(hayInteranual('2026-10-01', '2026-10-19', '2025-10-01')).toBe(true);
  });

  it('sin interanual si el mismo mes del año anterior empezó a mitad', () => {
    // Datos desde el 15/10/2025: octubre de 2025 está incompleto → no se compara octubre de 2026.
    expect(hayInteranual('2026-10-01', '2026-10-19', '2025-10-15')).toBe(false);
    // Noviembre de 2026 contra noviembre de 2025 (completo) sí.
    expect(hayInteranual('2026-11-01', '2026-11-10', '2025-10-15')).toBe(true);
  });

  it('el tramo interanual del mes en curso tiene la misma longitud (1..d contra 1..d)', () => {
    expect(rangoInteranual({ desde: '2026-10-01', hasta: '2026-10-19' }, true)).toEqual({
      desde: '2025-10-01',
      hasta: '2025-10-19',
    });
    // 29/02/2028 en curso: el 29 no existe en 2027 → hasta el 28.
    expect(rangoInteranual({ desde: '2028-02-01', hasta: '2028-02-29' }, true)).toEqual({
      desde: '2027-02-01',
      hasta: '2027-02-28',
    });
  });

  it('mes cerrado: mes completo contra mes completo (febrero 2029 contra febrero 2028, 29 días)', () => {
    const { actual, enCurso } = periodosComparacion('2029-02-01', '2029-03-10', '2027-01-01');
    expect(enCurso).toBe(false);
    expect(rangoInteranual(actual, enCurso)).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoInteranual({ desde: '2028-02-01', hasta: '2028-02-29' }, false)).toEqual({
      desde: '2027-02-01',
      hasta: '2027-02-28',
    });
  });
});

describe('serieGastoDiario (filas de gasto_por_dia)', () => {
  // gasto_por_dia solo devuelve días con gastos o devoluciones; el resto valen 0.
  const filas = [
    { fecha: '2026-10-03', gasto_neto: '40.00' },
    { fecha: '2026-10-05', gasto_neto: '0.30' },
    { fecha: '2026-10-07', gasto_neto: '-30.00' },
  ];

  it('rellena todos los días del mes y respeta negativos', () => {
    const dias = serieGastoDiario(filas, '2026-10-01', '2026-10-19');
    expect(dias).toHaveLength(31);
    expect(dias[2]).toEqual({ dia: 3, fecha: '2026-10-03', gasto: '40.00', hoy: false });
    expect(dias[4]?.gasto).toBe('0.30');
    expect(dias[6]?.gasto).toBe('-30.00');
    expect(dias[0]?.gasto).toBe('0.00');
  });

  it('los días futuros quedan vacíos y hoy se marca como provisional', () => {
    const dias = serieGastoDiario(filas, '2026-10-01', '2026-10-19');
    expect(dias[18]).toMatchObject({ dia: 19, hoy: true, gasto: '0.00' });
    expect(dias.slice(19).every((d) => d.gasto === null)).toBe(true);
  });

  it('un mes cerrado tiene todos sus días', () => {
    const dias = serieGastoDiario([], '2026-09-01', '2026-10-19');
    expect(dias).toHaveLength(30);
    expect(dias.every((d) => d.gasto === '0.00' && !d.hoy)).toBe(true);
  });
});

describe('repartirIngresos (filas de ingresos_por_categoria)', () => {
  it('% sobre el total de ingresos, exacto en céntimos', () => {
    const r = repartirIngresos([
      { categoria_id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', ingreso: '1458.00' },
      { categoria_id: 'otros', nombre: 'Otros ingresos', color: '#5fd3a0', ingreso: '50.00' },
    ]);
    expect(r).toEqual([
      { id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', importe: '1458.00', porcentaje: '96.6844' },
      { id: 'otros', nombre: 'Otros ingresos', color: '#5fd3a0', importe: '50.00', porcentaje: '3.3156' },
    ]);
  });

  it('sin ingresos → lista vacía', () => {
    expect(repartirIngresos([])).toEqual([]);
  });
});

describe('repartirCategorias (sección 8 y caso de la sección 11)', () => {
  it('categoría negativa (20 € de gasto y 50 € de devoluciones = −30,00 €) se lista aparte, fuera del gráfico', () => {
    const r = repartirCategorias(
      [
        { categoria_id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', gasto: '-30.00' },
        { categoria_id: 'ocio', nombre: 'Ocio', color: '#9b6bff', gasto: '40.00' },
        { categoria_id: 'rest', nombre: 'Restaurantes', color: '#ff8a3d', gasto: '90.00' },
        { categoria_id: 'cero', nombre: 'Cero', color: '#000000', gasto: '0.00' },
      ],
    );
    // % sobre la suma de las positivas (130 €): suman 100 % aunque haya una negativa.
    expect(r.positivas.map((c) => [c.nombre, c.porcentaje])).toEqual([
      ['Restaurantes', '69.2308'],
      ['Ocio', '30.7692'],
    ]);
    expect(r.negativas).toEqual([
      { categoria_id: 'otros', nombre: 'Otros gastos', color: '#8f9bbd', gasto: '-30.00', porcentaje: null },
    ]);
  });

  it('% sobre gastos netos 0 → sin porcentaje', () => {
    expect(porcentajeDe(100n, 0n)).toBeNull();
    expect(porcentajeDe(1n, 3n)).toBe('33.3333');
    expect(porcentajeDe(2n, 3n)).toBe('66.6667');
  });
});

describe('mediaMensual (solo meses completos)', () => {
  const meses = [
    { mes: '2026-06-01', balance: '210.50' },
    { mes: '2026-07-01', balance: '-45.20' },
    { mes: '2026-08-01', balance: '229.60' },
    { mes: '2026-09-01', balance: '339.72' },
    { mes: '2026-10-01', balance: '2458.32' }, // en curso: no entra
  ];

  it('excluye el mes en curso', () => {
    // (210,50 − 45,20 + 229,60 + 339,72) / 4 = 183,655 → 183,66
    expect(mediaMensual(meses, '2026-10-19', '2026-01-01')).toBe('183.66');
  });

  it('excluye meses anteriores a los datos o empezados a mitad', () => {
    // datos desde el 12/07: julio está incompleto → (229,60 + 339,72) / 2 = 284,66
    expect(mediaMensual(meses, '2026-10-19', '2026-07-12')).toBe('284.66');
  });

  it('sin meses completos → null («—»)', () => {
    expect(mediaMensual(meses, '2026-10-19', '2026-09-03')).toBeNull();
    expect(mediaMensual([], '2026-10-19', '2026-01-01')).toBeNull();
    expect(mediaMensual(meses, '2026-10-19', null)).toBeNull();
  });

  it('redondeo de medias negativas alejándose de cero', () => {
    expect(
      mediaMensual(
        [
          { mes: '2026-08-01', balance: '-0.01' },
          { mes: '2026-09-01', balance: '-0.02' },
        ],
        '2026-10-19',
        '2026-01-01',
      ),
    ).toBe('-0.02');
  });
});
