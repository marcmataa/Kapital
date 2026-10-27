import { describe, expect, it } from 'vitest';
import {
  diferenciaFila,
  emparejar,
  fraccionEntre,
  MAX_CATEGORIAS_CASCADA,
  pasosVariacionBalance,
  porcentajeDe,
  repartirIngresos,
  serieDiaria,
} from './agregaciones';
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


describe('serieDiaria (filas de movimientos_por_dia)', () => {
  // movimientos_por_dia solo devuelve días con movimientos; el resto valen 0 y sin lista.
  const filas = [
    {
      fecha: '2026-10-03',
      gastos: '50.00',
      devoluciones: '10.00',
      gasto_neto: '40.00',
      ingresos: '0.00',
      movimientos: [
        { id: 'a', tipo: 'gasto' as const, concepto: 'Cena', importe: '50.00' },
        { id: 'b', tipo: 'devolucion' as const, concepto: 'Ana', importe: '10.00' },
      ],
    },
    { fecha: '2026-10-07', gastos: '0.00', devoluciones: '30.00', gasto_neto: '-30.00', ingresos: '0.00', movimientos: [] },
  ];

  it('rellena todos los días del mes con los totales de SQL, sin sumar nada', () => {
    const dias = serieDiaria(filas, '2026-10-01', '2026-10-19');
    expect(dias).toHaveLength(31);
    expect(dias[2]).toEqual({
      dia: 3,
      fecha: '2026-10-03',
      hoy: false,
      datos: { gastos: '50.00', devoluciones: '10.00', gasto_neto: '40.00', ingresos: '0.00', movimientos: filas[0]?.movimientos },
    });
    expect(dias[6]?.datos?.gasto_neto).toBe('-30.00');
    expect(dias[0]?.datos).toEqual({ gastos: '0.00', devoluciones: '0.00', gasto_neto: '0.00', ingresos: '0.00', movimientos: [] });
  });

  it('los días futuros quedan vacíos y hoy se marca como provisional', () => {
    const dias = serieDiaria(filas, '2026-10-01', '2026-10-19');
    expect(dias[18]).toMatchObject({ dia: 19, hoy: true });
    expect(dias[18]?.datos).not.toBeNull();
    expect(dias.slice(19).every((d) => d.datos === null)).toBe(true);
  });

  it('un mes cerrado tiene todos sus días', () => {
    const dias = serieDiaria([], '2026-09-01', '2026-10-19');
    expect(dias).toHaveLength(30);
    expect(dias.every((d) => d.datos !== null && !d.hoy)).toBe(true);
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

describe('emparejar (este periodo vs el anterior)', () => {
  const actual = [
    { id: 'ocio', nombre: 'Ocio', importe: '40.00' },
    { id: 'super', nombre: 'Súper', importe: '120.00' },
  ];
  const anterior = [
    { id: 'super', nombre: 'Súper', importe: '100.00' },
    { id: 'viajes', nombre: 'Viajes', importe: '80.00' },
  ];

  it('une por id, pone 0,00 € en el periodo que falta y ordena por el importe actual', () => {
    expect(emparejar(actual, anterior, true)).toEqual([
      { id: 'super', nombre: 'Súper', actual: '120.00', anterior: '100.00' },
      { id: 'ocio', nombre: 'Ocio', actual: '40.00', anterior: '0.00' },
      { id: 'viajes', nombre: 'Viajes', actual: '0.00', anterior: '80.00' },
    ]);
  });

  it('sin periodo anterior (sección 8) no hay comparación', () => {
    expect(emparejar(actual, anterior, false)).toEqual([
      { id: 'super', nombre: 'Súper', actual: '120.00', anterior: null },
      { id: 'ocio', nombre: 'Ocio', actual: '40.00', anterior: null },
    ]);
  });
});

describe('dibujo', () => {
  it('fraccionEntre sitúa importes con negativos en el eje, acotados', () => {
    expect(fraccionEntre('0', -10_000n, 10_000n)).toBe(0.5);
    expect(fraccionEntre('-100.00', -10_000n, 10_000n)).toBe(0);
    expect(fraccionEntre('500.00', -10_000n, 10_000n)).toBe(1);
    expect(fraccionEntre('1', 0n, 0n)).toBe(0);
  });

  it('porcentajeDe: 4 decimales exactos; sin base, null', () => {
    expect(porcentajeDe(100n, 0n)).toBeNull();
    expect(porcentajeDe(1n, 3n)).toBe('33.3333');
    expect(porcentajeDe(2n, 3n)).toBe('66.6667');
  });
});

describe('emparejar · orden por variación (columna Δ)', () => {
  const actual = [
    { id: 'a', nombre: 'A', importe: '350.00' },
    { id: 'b', nombre: 'B', importe: '100.00' },
  ];
  const anterior = [
    { id: 'a', nombre: 'A', importe: '300.00' },
    { id: 'b', nombre: 'B', importe: '200.00' },
    { id: 'c', nombre: 'C', importe: '80.00' },
  ];

  it('por importe: de mayor a menor importe actual (por defecto)', () => {
    expect(emparejar(actual, anterior, true).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('por variación: de mayor a menor |Δ|, con la diferencia exacta en céntimos', () => {
    const filas = emparejar(actual, anterior, true, 'variacion');
    expect(filas.map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(filas.map(diferenciaFila)).toEqual([-10000n, -8000n, 5000n]);
  });

  it('sin periodo anterior no hay diferencia', () => {
    expect(emparejar(actual, [], false, 'variacion').map(diferenciaFila)).toEqual([null, null]);
  });
});

describe('pasosVariacionBalance (cascada: balance anterior → balance actual)', () => {
  // Inventado: anterior 1.000 − (300 + 200) = 500; actual 800 − (350 + 100 + 50,25) = 299,75.
  const totales = { ingresos: '800.00', ingresosAnterior: '1000.00', balance: '299.75', balanceAnterior: '500.00' };
  const gastos = [
    { id: 'a', nombre: 'A', importe: '350.00' },
    { id: 'b', nombre: 'B', importe: '100.00' },
    { id: 'c', nombre: 'C', importe: '50.25' },
  ];
  const gastosAnterior = [
    { id: 'a', nombre: 'A', importe: '300.00' },
    { id: 'b', nombre: 'B', importe: '200.00' },
  ];

  it('gastar más resta y gastar menos suma; la suma de los pasos da el balance exacto', () => {
    const pasos = pasosVariacionBalance(totales, gastos, gastosAnterior);
    expect(pasos?.map((p) => [p.tipo, p.nombre ?? null, p.importe, p.inicio, p.fin])).toEqual([
      ['inicio', null, '500.00', '0.00', '500.00'],
      ['ingresos', null, '-200.00', '500.00', '300.00'],
      ['categoria', 'B', '100.00', '300.00', '400.00'],
      ['categoria', 'C', '-50.25', '400.00', '349.75'],
      ['categoria', 'A', '-50.00', '349.75', '299.75'],
      ['fin', null, '299.75', '0.00', '299.75'],
    ]);
  });

  it('cambio de signo del balance: el último paso cruza el cero', () => {
    const pasos = pasosVariacionBalance({ ...totales, ingresos: '400.00', balance: '-100.25' }, gastos, gastosAnterior);
    expect(pasos?.at(-2)?.fin).toBe('-100.25');
    expect(pasos?.at(-1)).toMatchObject({ tipo: 'fin', importe: '-100.25' });
  });

  it('sin cambios en ingresos ni categorías: solo los dos balances', () => {
    const pasos = pasosVariacionBalance({ ...totales, ingresos: '1000.00', balance: '500.00' }, gastosAnterior, gastosAnterior);
    expect(pasos?.map((p) => p.tipo)).toEqual(['inicio', 'fin']);
  });

  it(`más de ${MAX_CATEGORIAS_CASCADA + 1} categorías con cambio: las de menos peso van en «Resto»`, () => {
    const muchas = Array.from({ length: 8 }, (_, i) => ({ id: `k${i}`, nombre: `K${i}`, importe: `${(i + 1) * 10}.00` }));
    // Anterior sin gasto: cada categoría resta lo que gastó; total 10 + 20 + … + 80 = 360.
    const pasos = pasosVariacionBalance({ ...totales, ingresos: '1000.00', balance: '140.00' }, muchas, []);
    expect(pasos?.filter((p) => p.tipo === 'categoria')).toHaveLength(MAX_CATEGORIAS_CASCADA);
    expect(pasos?.find((p) => p.tipo === 'resto')).toMatchObject({ importe: '-30.00', agrupadas: 2 });
  });

  it('sin periodo anterior o si los pasos no cuadran con el balance de SQL → null', () => {
    expect(pasosVariacionBalance({ ...totales, balanceAnterior: null }, gastos, [])).toBeNull();
    expect(pasosVariacionBalance({ ...totales, balance: '299.74' }, gastos, gastosAnterior)).toBeNull();
  });
});
