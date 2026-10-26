import { describe, expect, it } from 'vitest';
import { traducir, type Variables } from '@/shared/i18n';
import type { ClaveDe } from '@/shared/i18n';
import { clasificarErrorMovimiento, claveErrorMovimiento } from './api/errores';
import { filtroCursor } from './api/movimientosApi';
import { filtroBusqueda, limpiarBusqueda } from './lib/busqueda';
import { FILTROS_VACIOS, filtrosAParams, filtrosDesdeParams, type Filtros } from './lib/filtros';
import { claveErrorAjuste, leerSaldoReal } from './lib/ajuste';
import { agruparPorDia, eurosRedondos, importeConSigno, signoTotalTipo, tituloDia, tonoImporte } from './lib/presentacion';
import { aPayload, crearEsquemaMovimiento, cuentaPorDefecto, ordenarPorUso, type ValoresMovimiento } from './schemas/movimiento';
import { CATEGORIAS, CUENTAS, ID, movimiento } from './test/datos';

const t = (clave: ClaveDe<'movimientos'>, variables?: Variables) => traducir('es', 'movimientos', clave, variables);
const HOY = '2026-10-20';

const esquema = (extra: Partial<Parameters<typeof crearEsquemaMovimiento>[0]> = {}) =>
  crearEsquemaMovimiento({ t, locale: 'es-ES', hoy: HOY, cuentas: CUENTAS, categorias: CATEGORIAS, ...extra });

const base: ValoresMovimiento = {
  tipo: 'gasto',
  importe: '38,50',
  categoria_id: ID.restaurantes,
  cuenta_id: ID.caixa,
  cuenta_destino_id: '',
  metodo: 'tarjeta',
  devolucion_de: '',
  sentido: 'suma',
  fecha: '2026-10-17',
  concepto: 'Cena',
  notas: '',
};

function errores(valores: Partial<ValoresMovimiento>, extra?: Parameters<typeof esquema>[0]) {
  const r = esquema(extra).safeParse({ ...base, ...valores });
  if (r.success) return {};
  // Intl separa el «€» con un espacio duro: se normaliza para comparar.
  return Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message.replace(/\s/g, ' ')]));
}

function valido(valores: Partial<ValoresMovimiento>, extra?: Parameters<typeof esquema>[0]) {
  const r = esquema(extra).safeParse({ ...base, ...valores });
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data;
}

describe('esquema por tipo (reglas, sección 10)', () => {
  it('gasto: cuenta origen, categoría de gasto y método; sin destino', () => {
    expect(valido({})).toEqual({
      tipo: 'gasto',
      importe: '38.50',
      fecha: '2026-10-17',
      concepto: 'Cena',
      notas: null,
      categoria_id: ID.restaurantes,
      metodo: 'tarjeta',
      cuenta_id: ID.caixa,
      cuenta_destino_id: null,
      devolucion_de: null,
      sentido: null,
    });
  });

  it('gasto sin método o sin categoría se rechaza', () => {
    expect(errores({ metodo: '', categoria_id: '' })).toEqual({
      metodo: 'Elige cómo lo pagaste.',
      categoria_id: 'Elige una categoría.',
    });
  });

  it('ingreso necesita categoría de ingreso; entra en la cuenta (cuenta_id = destino)', () => {
    expect(errores({ tipo: 'ingreso', categoria_id: ID.ocio })).toEqual({
      categoria_id: 'Esa categoría no sirve para este tipo de movimiento.',
    });
    const p = valido({ tipo: 'ingreso', categoria_id: ID.nomina, metodo: '', cuenta_id: ID.ing, importe: '1.258,00' });
    expect(p).toMatchObject({ tipo: 'ingreso', importe: '1258.00', cuenta_id: ID.ing, cuenta_destino_id: null, metodo: null });
  });

  it('devolución usa categoría de gasto y la cuenta en la que entra', () => {
    expect(errores({ tipo: 'devolucion', categoria_id: ID.nomina })).toHaveProperty('categoria_id');
    const p = valido({ tipo: 'devolucion', categoria_id: ID.ocio, metodo: 'bizum', devolucion_de: ID.mov1 });
    expect(p).toMatchObject({ tipo: 'devolucion', cuenta_id: ID.caixa, cuenta_destino_id: null, devolucion_de: ID.mov1 });
  });

  it('traspaso: origen y destino distintos, sin categoría ni método', () => {
    expect(errores({ tipo: 'traspaso', cuenta_destino_id: ID.caixa })).toEqual({
      cuenta_destino_id: 'Elige una cuenta distinta de la de origen.',
    });
    expect(errores({ tipo: 'traspaso', cuenta_destino_id: '' })).toEqual({ cuenta_destino_id: 'Elige una cuenta.' });
    const p = valido({ tipo: 'traspaso', cuenta_destino_id: ID.efectivo });
    expect(p).toMatchObject({
      cuenta_id: ID.caixa,
      cuenta_destino_id: ID.efectivo,
      categoria_id: null,
      metodo: null,
      sentido: null,
    });
  });

  it('ajuste sin nota se rechaza; con nota guarda el sentido', () => {
    expect(errores({ tipo: 'ajuste', notas: '   ' })).toEqual({
      notas: 'Un ajuste necesita una nota que explique el descuadre.',
    });
    const p = valido({ tipo: 'ajuste', sentido: 'resta', notas: ' Descuadre con el extracto ' });
    expect(p).toMatchObject({ tipo: 'ajuste', sentido: 'resta', notas: 'Descuadre con el extracto', categoria_id: null, metodo: null });
  });

  it('importes positivos (sección 11): 0 se rechaza y «-24» se guarda como 24.00', () => {
    expect(errores({ importe: '0' })).toEqual({ importe: 'Introduce un importe mayor que 0.' });
    expect(errores({ importe: '0,00' })).toHaveProperty('importe');
    expect(errores({ importe: 'abc' })).toHaveProperty('importe');
    expect(valido({ tipo: 'devolucion', categoria_id: ID.ocio, importe: '-24' }).importe).toBe('24.00');
  });

  it('cuentas cerradas no se pueden usar (proteger_cuenta_cerrada)', () => {
    expect(errores({ cuenta_id: ID.cerrada })).toEqual({ cuenta_id: 'Esa cuenta está cerrada.' });
    expect(errores({ tipo: 'traspaso', cuenta_destino_id: ID.cerrada })).toEqual({
      cuenta_destino_id: 'Esa cuenta está cerrada.',
    });
  });

  it('fecha: no futura y no anterior a la fecha de partida de la cuenta (regla 2 del trigger)', () => {
    expect(errores({ fecha: '2026-10-21' })).toEqual({
      fecha: 'La fecha no puede ser futura: apunta el día en que ocurrió.',
    });
    expect(errores({ fecha: '2026-02-30' })).toEqual({ fecha: 'Introduce una fecha válida.' });
    expect(errores({ cuenta_id: ID.ing, fecha: '2026-10-04' })).toEqual({
      fecha: 'La cuenta Banco Dos empieza el 05/10/2026: el movimiento no puede ser anterior.',
    });
    // El destino de un traspaso también cuenta
    expect(errores({ tipo: 'traspaso', cuenta_destino_id: ID.ing, fecha: '2026-10-01' })).toHaveProperty('fecha');
  });

  it('concepto obligatorio', () => {
    expect(errores({ concepto: '  ' })).toEqual({ concepto: 'Escribe un concepto.' });
  });

  it('devolución vinculada: no supera lo que queda por devolver (regla 3)', () => {
    const extra = { pendienteGastoOriginal: '20.00' };
    expect(
      errores({ tipo: 'devolucion', categoria_id: ID.ocio, devolucion_de: ID.mov1, importe: '20,01' }, extra),
    ).toEqual({ importe: 'Supera lo que queda por devolver de ese gasto (20,00 €).' });
    expect(valido({ tipo: 'devolucion', categoria_id: ID.ocio, devolucion_de: ID.mov1, importe: '20' }, extra).importe).toBe(
      '20.00',
    );
  });

  it('gasto con devoluciones: no cambia de tipo ni baja de lo devuelto (regla 4)', () => {
    const extra = { tipoOriginal: 'gasto' as const, devueltoOriginal: '60.00' };
    expect(errores({ importe: '59,99' }, extra)).toEqual({
      importe: 'Este gasto tiene 60,00 € devueltos: no puede bajar de esa cantidad.',
    });
    expect(errores({ tipo: 'traspaso', cuenta_destino_id: ID.ing }, extra)).toHaveProperty('tipo');
    expect(valido({ importe: '60' }, extra).importe).toBe('60.00');
  });
});

describe('aPayload (mapeo por tipo)', () => {
  it('al cambiar de tipo, las columnas de otros tipos van a null', () => {
    const p = aPayload({
      ...base,
      tipo: 'ajuste',
      cuenta_destino_id: ID.ing,
      devolucion_de: ID.mov1,
      metodo: 'bizum',
      notas: 'Nota',
    }, 'es-ES');
    expect(p).toEqual({
      tipo: 'ajuste',
      importe: '38.50',
      fecha: '2026-10-17',
      concepto: 'Cena',
      notas: 'Nota',
      categoria_id: null,
      metodo: null,
      cuenta_id: ID.caixa,
      cuenta_destino_id: null,
      devolucion_de: null,
      sentido: 'suma',
    });
  });

  it('el importe es siempre un string normalizado, nunca un número', () => {
    const p = aPayload({ ...base, importe: '1.234,5' }, 'es-ES');
    expect(p.importe).toBe('1234.50');
    expect(typeof p.importe).toBe('string');
  });

  it('en inglés la coma es de miles: «1,000» son mil euros, no uno', () => {
    expect(aPayload({ ...base, importe: '1,000' }, 'en-GB').importe).toBe('1000.00');
    expect(aPayload({ ...base, importe: '1,234.56' }, 'en-GB').importe).toBe('1234.56');
  });
});

describe('cuentaPorDefecto', () => {
  it('principal; efectivo si el método es efectivo; nunca una cerrada', () => {
    expect(cuentaPorDefecto(CUENTAS, 'tarjeta')).toBe(ID.caixa);
    expect(cuentaPorDefecto(CUENTAS, 'efectivo')).toBe(ID.efectivo);
    expect(cuentaPorDefecto(CUENTAS.filter((c) => c.id === ID.cerrada), '')).toBe('');
  });
});

describe('búsqueda segura (filtro or de PostgREST)', () => {
  it('construye el filtro sobre concepto y comercio', () => {
    expect(filtroBusqueda('  cena  ')).toBe('concepto.ilike."*cena*",comercio.ilike."*cena*"');
    expect(filtroBusqueda('')).toBeNull();
    expect(filtroBusqueda(',,()*')).toBeNull();
  });

  it('quita los caracteres reservados: no se pueden inyectar condiciones', () => {
    const ataques = [
      'x),id.neq.0,(concepto.ilike.*',
      'a,user_id.eq.otro',
      'b"),or(id.gt.0',
      'c\\",tipo.eq.gasto',
      "d'*:%_",
      'e\n,f\t(g)',
    ];
    for (const ataque of ataques) {
      const limpio = limpiarBusqueda(ataque);
      expect(limpio).not.toMatch(/[,()*:.\\"'%_\n\t]/);
      const filtro = filtroBusqueda(ataque);
      // Solo dos condiciones: exactamente una coma separadora, y nada fuera de las comillas.
      expect(filtro?.split(',').length).toBe(2);
      expect(filtro).toMatch(/^concepto\.ilike\."\*[^"]*\*",comercio\.ilike\."\*[^"]*\*"$/);
    }
  });

  it('mantiene acentos y espacios y limita la longitud', () => {
    expect(limpiarBusqueda('Café  la   Plaça')).toBe('Café la Plaça');
    expect(limpiarBusqueda('a'.repeat(500))).toHaveLength(80);
  });
});

describe('cursor de paginación', () => {
  it('pide lo estrictamente anterior por (fecha, created_at, id)', () => {
    expect(filtroCursor({ fecha: '2026-10-14', created_at: '2026-10-14T18:00:00+00:00', id: ID.mov1 })).toBe(
      'fecha.lt."2026-10-14",and(fecha.eq."2026-10-14",created_at.lt."2026-10-14T18:00:00+00:00"),' +
        `and(fecha.eq."2026-10-14",created_at.eq."2026-10-14T18:00:00+00:00",id.lt."${ID.mov1}")`,
    );
  });
});

describe('filtros en la URL', () => {
  it('ida y vuelta sin perder nada', () => {
    const f: Filtros = {
      q: 'cena',
      tipo: 'gasto',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      categoria: ID.ocio,
      metodo: 'bizum',
      cuenta: ID.caixa,
    };
    const params = filtrosAParams(f);
    expect(filtrosDesdeParams(new URLSearchParams(params.toString()))).toEqual(f);
  });

  it('los vacíos no aparecen y se conservan otros parámetros', () => {
    const params = filtrosAParams({ ...FILTROS_VACIOS, tipo: 'ajuste' }, new URLSearchParams('sel=x&q=antes'));
    expect(params.toString()).toBe('sel=x&tipo=ajuste');
  });

  it('valores no válidos se ignoran (no llegan a la consulta)', () => {
    const f = filtrosDesdeParams(
      new URLSearchParams('tipo=robo&metodo=x&desde=2026-13-01&hasta=ayer&categoria=1,id.gt.0&cuenta=abc'),
    );
    expect(f).toEqual(FILTROS_VACIOS);
  });
});

describe('presentación de la lista', () => {
  it('signo y color según el tipo; el importe nunca es negativo en la base', () => {
    const casos = [
      [movimiento({ id: ID.mov1, tipo: 'gasto', importe: '38.50' }), '-38,50 €', 'negativo'],
      [movimiento({ id: ID.mov2, tipo: 'ingreso', importe: '1258.00' }), '+1.258,00 €', 'positivo'],
      [movimiento({ id: ID.mov3, tipo: 'devolucion', importe: '24.00' }), '+24,00 €', 'positivo'],
      [movimiento({ id: ID.mov4, tipo: 'traspaso', importe: '100.00' }), '100,00 €', 'neutro'],
      [movimiento({ id: ID.mov5, tipo: 'ajuste', importe: '3.12', sentido: 'resta' }), '-3,12 €', 'neutro'],
    ] as const;
    for (const [m, texto, tono] of casos) {
      expect(importeConSigno(m, 'es-ES').replace(/\s/g, ' ')).toBe(texto);
      expect(tonoImporte(m)).toBe(tono);
    }
  });

  it('agrupa por día respetando el orden; la cabecera lleva el año solo si no es el actual', () => {
    const grupos = agruparPorDia([
      movimiento({ id: ID.mov1, fecha: '2026-10-14' }),
      movimiento({ id: ID.mov2, fecha: '2026-10-14' }),
      movimiento({ id: ID.mov3, fecha: '2026-10-12' }),
      movimiento({ id: ID.mov4, fecha: '2025-10-02' }),
    ]);
    expect(grupos.map((g) => [g.fecha, g.movimientos.length])).toEqual([
      ['2026-10-14', 2],
      ['2026-10-12', 1],
      ['2025-10-02', 1],
    ]);
    expect(tituloDia('2026-10-14', HOY, 'es-ES')).toBe('14 oct');
    expect(tituloDia('2025-10-02', HOY, 'es-ES')).toBe('2 oct 2025');
    expect(tituloDia('2026-10-14', HOY, 'en-GB')).toBe('14 Oct');
  });

  it('chips: total redondeado a euros, sin float, con el signo del tipo', () => {
    const e = (importe: string, tipo: Parameters<typeof signoTotalTipo>[0]) =>
      eurosRedondos(importe, 'es-ES', signoTotalTipo(tipo)).replace(/\s/g, ' ');
    expect(e('863.40', 'gasto')).toBe('-863 €');
    expect(e('1258.50', 'ingreso')).toBe('+1.259 €');
    expect(e('24.00', 'devolucion')).toBe('+24 €');
    expect(e('100.00', 'traspaso')).toBe('100 €');
    expect(e('-5.00', 'ajuste')).toBe('-5 €');
    expect(e('0.40', 'gasto')).toBe('0 €');
    // 0,1 + 0,2 llega ya sumado de SQL como string exacto
    expect(e('0.30', 'ingreso')).toBe('0 €');
    expect(() => eurosRedondos('1,5', 'es-ES')).toThrow();
  });
});

describe('ajuste por saldo real', () => {
  it('lee el saldo con su signo y según el idioma; la diferencia no se calcula aquí', () => {
    expect(leerSaldoReal('1.258,50', 'es-ES')).toBe('1258.50');
    expect(leerSaldoReal('-20', 'es-ES')).toBe('-20.00');
    expect(leerSaldoReal('−20,5', 'ca-ES')).toBe('-20.50');
    expect(leerSaldoReal('1,258.50', 'en-GB')).toBe('1258.50');
    expect(leerSaldoReal('-0', 'es-ES')).toBe('0.00');
    expect(leerSaldoReal('', 'es-ES')).toBeNull();
    expect(leerSaldoReal('12-3', 'es-ES')).toBeNull();
    expect(leerSaldoReal('abc', 'es-ES')).toBeNull();
    expect(leerSaldoReal('99999999999', 'es-ES')).toBeNull();
  });

  it('traduce los códigos de calcular_ajuste / crear_ajuste', () => {
    expect(claveErrorAjuste({ codigo: '22023', mensaje: 'saldo_no_valido' })).toBe('ajuste.error.saldo');
    expect(claveErrorAjuste({ codigo: '22023', mensaje: 'cuenta_inversion' })).toBe('ajuste.error.inversion');
    expect(claveErrorAjuste({ codigo: 'red' })).toBe('error.red');
    expect(claveErrorAjuste({ codigo: '42501' })).toBe('error.generico');
  });
});

describe('categorías por uso', () => {
  it('ordena como categorias_mas_usadas; las que falten, al final en su orden', () => {
    const lista = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(ordenarPorUso(lista, ['c', 'a']).map((c) => c.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(ordenarPorUso(lista, undefined).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('errores de la base → texto amable', () => {
  const clave = (error: unknown) => claveErrorMovimiento(clasificarErrorMovimiento(error));

  it('clasifica los mensajes del trigger sin enseñarlos', () => {
    expect(clave({ code: '23514', message: 'La cuenta Banco Viejo está cerrada: reábrela para cambiar sus datos' })).toBe(
      'error.cuentaCerrada',
    );
    expect(clave({ code: '23514', message: 'La cuenta Banco Dos empieza el 2026-10-05; el movimiento es del 2026-10-01' })).toBe(
      'error.fechaAntesDeCuenta',
    );
    expect(clave({ code: '23514', message: 'Las devoluciones (70.00 €) superan el gasto original (60.00 €)' })).toBe(
      'error.devolucionSupera',
    );
    expect(clave({ code: '23514', message: 'Este gasto tiene 60.00 € devueltos; no puede bajar de esa cantidad ni cambiar de tipo' })).toBe(
      'error.gastoConDevoluciones',
    );
    expect(clave({ code: '23514', message: 'Un ingreso necesita una categoría de ingreso' })).toBe('error.categoriaTipo');
    expect(clave({ code: '23514', message: 'Solo se puede devolver un gasto' })).toBe('error.soloGasto');
    expect(
      clave({ code: '23514', message: 'new row for relation "movimientos" violates check constraint "traspaso_con_destino"' }),
    ).toBe('error.traspasoCuentas');
    expect(clave({ code: '23503', message: 'insert or update violates foreign key constraint' })).toBe('error.referencia');
    expect(clave({ code: '42501', message: 'permission denied' })).toBe('error.generico');
    expect(clave(new TypeError('Failed to fetch'))).toBe('error.red');
  });
});
