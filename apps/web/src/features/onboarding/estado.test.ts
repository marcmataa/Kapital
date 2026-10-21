import { describe, expect, it } from 'vitest';
import { claveErrorOnboarding } from './api/onboardingApi';
import { validarNombreBanco, type BancoElegido } from './components/SelectorBanco';
import {
  caberMasBancos,
  construirPayload,
  estadoInicial,
  reducerOnboarding,
  type AccionOnboarding,
  type EstadoOnboarding,
} from './hooks/estadoOnboarding';
import { leerSaldo, sumarSaldos } from './schemas/saldo';

const caixa: BancoElegido = {
  entidad: 'caixabank',
  nombre: 'CaixaBank',
  color: null,
};
const bbva: BancoElegido = { entidad: 'bbva', nombre: 'BBVA', color: null };
const propio: BancoElegido = {
  entidad: null,
  nombre: 'Caja Rural',
  color: '#7c3aed',
};

const aplicar = (acciones: AccionOnboarding[], inicial: EstadoOnboarding = estadoInicial()) =>
  acciones.reduce(reducerOnboarding, inicial);

/** Estado en el paso 4 con CaixaBank 1.258,50 como principal. */
const enPaso4 = () =>
  aplicar([
    { tipo: 'siguiente' },
    { tipo: 'principal', banco: caixa },
    { tipo: 'siguiente' },
    { tipo: 'saldoPrincipal', texto: '1.258,50' },
    { tipo: 'siguiente' },
  ]);

describe('leerSaldo (réplica de leer_saldo)', () => {
  it.each([
    ['1.258,50', '1258.50'],
    ['1258,5', '1258.50'],
    ['0', '0.00'],
    ['300', '300.00'],
    ['1.200', '1200.00'],
    ['38,5 €', '38.50'],
    ['  40 ', '40.00'],
    ['1,005', '1.01'],
    ['9999999999,99', '9999999999.99'],
  ])('acepta %s → %s', (texto, esperado) => {
    expect(leerSaldo(texto, 'es-ES')).toEqual({ ok: true, valor: esperado });
  });

  it.each([
    ['', 'vacio'],
    ['   ', 'vacio'],
    ['€', 'vacio'],
    ['-24', 'invalido'],
    ['+5', 'invalido'],
    ['abc', 'invalido'],
    ['12a', 'invalido'],
    [',5', 'invalido'],
    ['1.2.3', 'invalido'],
    ['10000000000', 'maximo'],
  ])('rechaza «%s» (%s)', (texto, error) => {
    expect(leerSaldo(texto, 'es-ES')).toEqual({ ok: false, error });
  });
});

describe('leerSaldo en inglés', () => {
  it.each([
    ['1,258.50', '1258.50'],
    ['1,000', '1000.00'],
    ['38.5', '38.50'],
    ['0', '0.00'],
  ])('acepta %s → %s', (texto, esperado) => {
    expect(leerSaldo(texto, 'en-GB')).toEqual({ ok: true, valor: esperado });
  });

  it('rechaza una coma ambigua («1,5») en vez de leerla como 15 o 1,5', () => {
    expect(leerSaldo('1,5', 'en-GB')).toEqual({ ok: false, error: 'invalido' });
  });
});

describe('sumarSaldos (patrimonio de partida, reglas §4)', () => {
  it('suma exacta en céntimos', () => {
    expect(sumarSaldos(['1258.50', '300.00', '40.00'])).toBe('1598.50');
  });

  it('sin errores de coma flotante: 0,10 + 0,20 = 0,30', () => {
    expect(sumarSaldos(['0.10', '0.20'])).toBe('0.30');
  });

  it('todo a cero → 0.00', () => {
    expect(sumarSaldos(['0.00', '0.00'])).toBe('0.00');
  });

  it('cinco bancos al máximo + efectivo no pierden precisión', () => {
    expect(sumarSaldos(Array.from({ length: 6 }, () => '9999999999.99'))).toBe('59999999999.94');
  });
});

describe('validarNombreBanco', () => {
  it('vacío o solo espacios', () => {
    expect(validarNombreBanco('')).toBe('vacio');
    expect(validarNombreBanco('   ')).toBe('vacio');
  });

  it('repetido sin distinguir mayúsculas ni espacios', () => {
    expect(validarNombreBanco('  caixabank ', ['CaixaBank'])).toBe('ocupado');
    expect(validarNombreBanco('EFECTIVO', ['Efectivo'])).toBe('ocupado');
  });

  it('nombre libre', () => {
    expect(validarNombreBanco('Caja Rural', ['CaixaBank'])).toBeNull();
  });
});

describe('reducerOnboarding', () => {
  it('empieza en el paso 1 con el idioma dado y efectivo 0', () => {
    const e = estadoInicial('ca');
    expect(e).toMatchObject({
      paso: 1,
      idioma: 'ca',
      principal: null,
      efectivo: '0',
      extras: [],
    });
  });

  it('cambia el idioma', () => {
    expect(aplicar([{ tipo: 'idioma', idioma: 'en' }]).idioma).toBe('en');
  });

  it('sin banco principal no avanza del paso 2 y marca el intento', () => {
    const e = aplicar([{ tipo: 'siguiente' }, { tipo: 'siguiente' }]);
    expect(e.paso).toBe(2);
    expect(e.intentoFallido).toBe(true);
  });

  it('un saldo no válido bloquea el paso 3; al corregirlo avanza', () => {
    const base = aplicar([{ tipo: 'siguiente' }, { tipo: 'principal', banco: caixa }, { tipo: 'siguiente' }]);
    const malo = aplicar([{ tipo: 'saldoPrincipal', texto: '-24' }, { tipo: 'siguiente' }], base);
    expect(malo.paso).toBe(3);
    expect(malo.intentoFallido).toBe(true);
    const bueno = aplicar([{ tipo: 'saldoPrincipal', texto: '0' }, { tipo: 'siguiente' }], malo);
    expect(bueno.paso).toBe(4);
    expect(bueno.intentoFallido).toBe(false);
  });

  it('paso 4: «Siguiente» sin borrador va al efectivo', () => {
    expect(aplicar([{ tipo: 'siguiente' }], enPaso4()).paso).toBe(5);
  });

  it('paso 4: «Siguiente» con borrador válido lo añade', () => {
    const e = aplicar(
      [{ tipo: 'borrador', banco: bbva }, { tipo: 'saldoBorrador', texto: '300' }, { tipo: 'siguiente' }],
      enPaso4(),
    );
    expect(e.paso).toBe(5);
    expect(e.extras).toEqual([{ banco: bbva, saldo: '300' }]);
    expect(e.borrador).toBeNull();
  });

  it('paso 4: borrador sin saldo no avanza ni se añade', () => {
    const e = aplicar([{ tipo: 'borrador', banco: bbva }, { tipo: 'siguiente' }], enPaso4());
    expect(e.paso).toBe(4);
    expect(e.extras).toEqual([]);
    expect(e.intentoFallido).toBe(true);
    const e2 = aplicar([{ tipo: 'anadirBorrador' }], e);
    expect(e2.extras).toEqual([]);
  });

  it('«Saltar» descarta el borrador y va al efectivo', () => {
    const e = aplicar(
      [{ tipo: 'borrador', banco: bbva }, { tipo: 'saldoBorrador', texto: '300' }, { tipo: 'saltar' }],
      enPaso4(),
    );
    expect(e.paso).toBe(5);
    expect(e.extras).toEqual([]);
    expect(e.borrador).toBeNull();
  });

  it('«Saltar» fuera del paso 4 no hace nada', () => {
    const e = estadoInicial();
    expect(reducerOnboarding(e, { tipo: 'saltar' })).toBe(e);
  });

  it('máximo 5 bancos: con 4 añadidos no se puede elegir otro', () => {
    let e = enPaso4();
    for (const banco of [
      bbva,
      propio,
      { entidad: 'ing', nombre: 'ING', color: null },
      { entidad: 'revolut', nombre: 'Revolut', color: null },
    ] as BancoElegido[]) {
      e = aplicar([{ tipo: 'borrador', banco }, { tipo: 'saldoBorrador', texto: '1' }, { tipo: 'anadirBorrador' }], e);
    }
    expect(e.extras).toHaveLength(4);
    expect(caberMasBancos(e)).toBe(false);
    const sin = reducerOnboarding(e, {
      tipo: 'borrador',
      banco: { entidad: 'santander', nombre: 'Santander', color: null },
    });
    expect(sin.borrador).toBeNull();
    expect(construirPayload(sin)?.p_bancos).toHaveLength(5);
  });

  it('quita un banco añadido', () => {
    const e = aplicar(
      [
        { tipo: 'borrador', banco: bbva },
        { tipo: 'saldoBorrador', texto: '1' },
        { tipo: 'anadirBorrador' },
        { tipo: 'borrador', banco: propio },
        { tipo: 'saldoBorrador', texto: '2' },
        { tipo: 'anadirBorrador' },
        { tipo: 'quitarExtra', indice: 0 },
      ],
      enPaso4(),
    );
    expect(e.extras).toEqual([{ banco: propio, saldo: '2' }]);
  });

  it('«Atrás» no baja del paso 1 y conserva los datos', () => {
    expect(reducerOnboarding(estadoInicial(), { tipo: 'atras' }).paso).toBe(1);
    const e = reducerOnboarding(enPaso4(), { tipo: 'atras' });
    expect(e.paso).toBe(3);
    expect(e.saldoPrincipal).toBe('1.258,50');
  });

  it('efectivo no válido bloquea el paso 5', () => {
    const e = aplicar([{ tipo: 'siguiente' }, { tipo: 'efectivo', texto: 'mucho' }, { tipo: 'siguiente' }], enPaso4());
    expect(e.paso).toBe(5);
    expect(e.intentoFallido).toBe(true);
  });
});

describe('construirPayload', () => {
  it('en inglés lee los saldos con coma de miles: «1,258.50» → 1258.50 y «1,000» → 1000.00', () => {
    const e = aplicar(
      [
        { tipo: 'siguiente' },
        { tipo: 'principal', banco: caixa },
        { tipo: 'siguiente' },
        { tipo: 'saldoPrincipal', texto: '1,258.50' },
        { tipo: 'siguiente' },
        { tipo: 'siguiente' },
        { tipo: 'efectivo', texto: '1,000' },
        { tipo: 'siguiente' },
      ],
      estadoInicial('en'),
    );
    expect(e.paso).toBe(6);
    const payload = construirPayload(e);
    expect(payload?.p_bancos[0]?.saldo).toBe('1258.50');
    expect(payload?.p_efectivo).toBe('1000.00');
  });

  it('principal primero, saldos normalizados', () => {
    const e = aplicar(
      [
        { tipo: 'borrador', banco: propio },
        { tipo: 'saldoBorrador', texto: '300' },
        { tipo: 'siguiente' },
        { tipo: 'efectivo', texto: '40' },
        { tipo: 'siguiente' },
      ],
      enPaso4(),
    );
    expect(e.paso).toBe(6);
    expect(construirPayload(e)).toEqual({
      p_idioma: 'es',
      p_bancos: [
        {
          entidad: 'caixabank',
          nombre: 'CaixaBank',
          color: null,
          saldo: '1258.50',
        },
        {
          entidad: null,
          nombre: 'Caja Rural',
          color: '#7c3aed',
          saldo: '300.00',
        },
      ],
      p_efectivo: '40.00',
    });
  });

  it('null si falta el principal o hay un saldo no válido', () => {
    expect(construirPayload(estadoInicial())).toBeNull();
    expect(construirPayload({ ...enPaso4(), saldoPrincipal: 'x' })).toBeNull();
    expect(construirPayload({ ...enPaso4(), efectivo: '-1' })).toBeNull();
  });
});

describe('claveErrorOnboarding', () => {
  it.each([
    ['P0001', 'error.yaCompletado'],
    ['22023', 'error.datos'],
    ['23505', 'error.nombreDuplicado'],
    ['23514', 'error.limite'],
    ['42501', 'error.sesion'],
    ['red', 'error.red'],
    ['XX000', 'error.generico'],
  ])('%s → %s', (codigo, clave) => {
    expect(claveErrorOnboarding({ codigo })).toBe(clave);
  });

  it('sin error conocido → genérico', () => {
    expect(claveErrorOnboarding(undefined)).toBe('error.generico');
  });
});
