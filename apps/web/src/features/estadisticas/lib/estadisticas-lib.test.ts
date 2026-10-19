import { describe, expect, it } from 'vitest';
import {
  gastoNetoPorDia,
  ingresosPorCategoria,
  mediaMensual,
  porcentajeDe,
  repartirCategorias,
  type CategoriaIngresoRef,
  type MovimientoLigero,
} from './agregaciones';
import { hayInteranual, mesesDisponibles, periodosComparacion, rangoInteranual, ultimosMeses } from './periodos';

const mov = (fecha: string, tipo: MovimientoLigero['tipo'], importe: string, categoria_id: string | null = null) => ({
  fecha,
  tipo,
  importe,
  categoria_id,
});

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

  it('el tramo interanual tiene la misma longitud', () => {
    expect(rangoInteranual({ desde: '2026-10-01', hasta: '2026-10-19' })).toEqual({
      desde: '2025-10-01',
      hasta: '2025-10-19',
    });
    expect(rangoInteranual({ desde: '2028-02-01', hasta: '2028-02-29' })).toEqual({
      desde: '2027-02-01',
      hasta: '2027-02-28',
    });
  });
});

describe('gastoNetoPorDia', () => {
  const movs = [
    mov('2026-10-03', 'gasto', '100.00', 'ocio'),
    mov('2026-10-03', 'devolucion', '15.00', 'ocio'),
    mov('2026-10-03', 'devolucion', '15.00', 'ocio'),
    mov('2026-10-03', 'devolucion', '15.00', 'ocio'),
    mov('2026-10-03', 'devolucion', '15.00', 'ocio'),
    mov('2026-10-05', 'gasto', '0.10'),
    mov('2026-10-05', 'gasto', '0.20'),
    mov('2026-10-05', 'traspaso', '100.00'),
    mov('2026-10-05', 'ingreso', '1258.00'),
    mov('2026-10-05', 'ajuste', '5.00'),
  ] satisfies MovimientoLigero[];

  it('gastos − devoluciones por día, exacto (0,10 + 0,20 = 0,30); traspasos, ingresos y ajustes no cuentan', () => {
    const dias = gastoNetoPorDia(movs, '2026-10-01', '2026-10-19');
    expect(dias).toHaveLength(31);
    expect(dias[2]).toEqual({ dia: 3, fecha: '2026-10-03', gasto: '40.00', hoy: false });
    expect(dias[4]?.gasto).toBe('0.30');
    expect(dias[0]?.gasto).toBe('0.00');
  });

  it('los días futuros quedan vacíos y hoy se marca como provisional', () => {
    const dias = gastoNetoPorDia(movs, '2026-10-01', '2026-10-19');
    expect(dias[18]).toMatchObject({ dia: 19, hoy: true, gasto: '0.00' });
    expect(dias.slice(19).every((d) => d.gasto === null)).toBe(true);
  });

  it('un mes cerrado tiene todos sus días', () => {
    const dias = gastoNetoPorDia([], '2026-09-01', '2026-10-19');
    expect(dias).toHaveLength(30);
    expect(dias.every((d) => d.gasto === '0.00' && !d.hoy)).toBe(true);
  });
});

describe('ingresosPorCategoria', () => {
  const categorias: CategoriaIngresoRef[] = [
    { id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', tipo: 'ingreso', orden: 1 },
    { id: 'otros', nombre: 'Otros ingresos', color: '#5fd3a0', tipo: 'ingreso', orden: 2 },
    { id: 'rend', nombre: 'Rendimientos', color: '#14b8a6', tipo: 'ingreso', orden: 3 },
    { id: 'ocio', nombre: 'Ocio', color: '#9b6bff', tipo: 'gasto', orden: 4 },
  ];

  it('solo ingresos y categorías de ingreso; las devoluciones y traspasos nunca aparecen', () => {
    const r = ingresosPorCategoria(
      [
        mov('2026-09-01', 'ingreso', '1258.00', 'nomina'),
        mov('2026-09-15', 'ingreso', '200.00', 'nomina'),
        mov('2026-09-20', 'ingreso', '50.00', 'otros'),
        mov('2026-09-21', 'devolucion', '24.00', 'ocio'),
        mov('2026-09-22', 'gasto', '100.00', 'ocio'),
        mov('2026-09-23', 'traspaso', '100.00'),
      ],
      categorias,
    );
    expect(r).toEqual([
      { id: 'nomina', nombre: 'Nómina', color: '#5fd3a0', importe: '1458.00', porcentaje: '96.6844' },
      { id: 'otros', nombre: 'Otros ingresos', color: '#5fd3a0', importe: '50.00', porcentaje: '3.3156' },
    ]);
  });

  it('sin ingresos → lista vacía', () => {
    expect(ingresosPorCategoria([mov('2026-09-21', 'devolucion', '24.00', 'ocio')], categorias)).toEqual([]);
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
