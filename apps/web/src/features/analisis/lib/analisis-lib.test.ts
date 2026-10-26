import { describe, expect, it } from 'vitest';
import type { FilaAnalisis } from '../schemas/esquemas';
import { accionAnalisis, estaAtascado } from './acciones';
import { claveErrorAnalisis, codigoErrorFuncion } from './errores';
import { barrasCascada } from '../components/GraficoCascada';
import type { PasoCascada } from '../schemas/esquemas';
import { entradasMeses, esGenerable, mesDeRuta, rutaDeMes, ultimoMesCerrado } from './meses';

const fila = (mes: string, estado: FilaAnalisis['estado'] = 'listo'): FilaAnalisis => ({
  id: `id-${mes}`,
  mes,
  estado,
  mes_incompleto: false,
  regeneraciones: 0,
  intentos: 0,
  generado_at: null,
  updated_at: '2026-10-01T05:00:00Z',
});

describe('entradasMeses', () => {
  it('mes en curso + meses con fila + meses cerrados generables (≤ 12 atrás, no antes de los datos)', () => {
    const e = entradasMeses('2026-10-19', '2026-07-12', [fila('2026-09-01')]);
    expect(e.map((x) => [x.mes, x.tipo])).toEqual([
      ['2026-10-01', 'en_curso'],
      ['2026-09-01', 'fila'],
      ['2026-08-01', 'generable'],
      ['2026-07-01', 'generable'],
    ]);
  });

  it('no ofrece generar más de 12 meses atrás, pero muestra filas antiguas', () => {
    const e = entradasMeses('2026-10-19', '2020-01-01', [fila('2024-05-01')]);
    const generables = e.filter((x) => x.tipo === 'generable').map((x) => x.mes);
    expect(generables).toHaveLength(12);
    expect(generables.at(-1)).toBe('2025-10-01');
    expect(e.at(-1)).toMatchObject({ tipo: 'fila', mes: '2024-05-01' });
  });

  it('sin cuentas: solo el mes en curso', () => {
    expect(entradasMeses('2026-10-19', null, [])).toEqual([{ tipo: 'en_curso', mes: '2026-10-01' }]);
  });

  it('esGenerable', () => {
    expect(esGenerable('2026-09-01', '2026-10-19', '2026-09-12')).toBe(true);
    expect(esGenerable('2026-10-01', '2026-10-19', '2026-01-01')).toBe(false);
    expect(esGenerable('2025-09-01', '2026-10-19', '2020-01-01')).toBe(false);
    expect(esGenerable('2026-08-01', '2026-10-19', '2026-09-12')).toBe(false);
  });

  it('rutas /analisis/YYYY-MM', () => {
    expect(mesDeRuta('2026-09')).toBe('2026-09-01');
    expect(mesDeRuta('2026-13')).toBeNull();
    expect(mesDeRuta('septiembre')).toBeNull();
    expect(rutaDeMes('2026-09-01')).toBe('/analisis/2026-09');
  });
});

const http = (status: number, cuerpo: unknown) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(JSON.stringify(cuerpo), { status }),
});

describe('codigoErrorFuncion', () => {
  it('lee el código del cuerpo { error }', async () => {
    expect(await codigoErrorFuncion(http(429, { error: 'limite_regeneracion' }))).toBe('limite_regeneracion');
    expect(await codigoErrorFuncion(http(409, { error: 'en_curso' }))).toBe('en_curso');
    expect(await codigoErrorFuncion(http(502, { error: 'generacion_fallida' }))).toBe('generacion_fallida');
    expect(await codigoErrorFuncion(http(400, { error: 'mes_no_disponible' }))).toBe('mes_no_disponible');
  });

  it('cuerpo ilegible o desconocido → por código HTTP; nunca el texto del proveedor', async () => {
    expect(
      await codigoErrorFuncion({ name: 'FunctionsHttpError', context: new Response('<html>Bad gateway', { status: 502 }) }),
    ).toBe('generacion_fallida');
    expect(await codigoErrorFuncion(http(429, { error: 'OpenAI rate limit exceeded' }))).toBe('limite_regeneracion');
    expect(await codigoErrorFuncion(http(418, { error: 'tetera' }))).toBe('desconocido');
  });

  it('errores de red', async () => {
    expect(await codigoErrorFuncion(new TypeError('Failed to fetch'))).toBe('red');
    expect(await codigoErrorFuncion({ name: 'FunctionsFetchError', context: {} })).toBe('red');
    expect(await codigoErrorFuncion('raro')).toBe('desconocido');
  });

  it('claveErrorAnalisis', () => {
    expect(claveErrorAnalisis('limite_regeneracion')).toBe('error.limite');
    expect(claveErrorAnalisis('limite_reintentos')).toBe('error.limiteReintentos');
    expect(claveErrorAnalisis('en_curso')).toBe('error.enCurso');
    expect(claveErrorAnalisis('generacion_fallida')).toBe('error.generacion');
    expect(claveErrorAnalisis('red')).toBe('error.red');
    expect(claveErrorAnalisis('error_interno')).toBe('error.generico');
  });
});

describe('accionAnalisis (reintentar no consume; regenerar solo si está listo)', () => {
  const ahora = Date.parse('2026-10-19T10:00:00Z');
  const con = (cambios: Partial<FilaAnalisis>): FilaAnalisis => ({ ...fila('2026-09-01'), ...cambios });

  it('listo: regenerar una vez; después agotado', () => {
    expect(accionAnalisis(con({ estado: 'listo' }), ahora)).toBe('regenerar');
    expect(accionAnalisis(con({ estado: 'listo', regeneraciones: 1 }), ahora)).toBe('agotado');
  });

  it('error: reintentar mientras intentos < 3, aunque ya se haya regenerado', () => {
    expect(accionAnalisis(con({ estado: 'error', intentos: 0 }), ahora)).toBe('reintentar');
    expect(accionAnalisis(con({ estado: 'error', intentos: 2, regeneraciones: 1 }), ahora)).toBe('reintentar');
    expect(accionAnalisis(con({ estado: 'error', intentos: 3 }), ahora)).toBe('sin_reintentos');
  });

  it('pendiente/generando: esperar hasta 15 min; después, atascado → reintentar', () => {
    expect(accionAnalisis(con({ estado: 'generando', updated_at: '2026-10-19T09:45:00Z' }), ahora)).toBe('esperar');
    expect(accionAnalisis(con({ estado: 'pendiente', updated_at: '2026-10-19T09:44:59Z' }), ahora)).toBe('reintentar');
    expect(estaAtascado(con({ estado: 'listo', updated_at: '2020-01-01T00:00:00Z' }), ahora)).toBe(false);
    expect(estaAtascado(con({ estado: 'generando', updated_at: 'no es fecha' }), ahora)).toBe(false);
  });
});

describe('ultimoMesCerrado', () => {
  it('es el mes anterior al de hoy, también en enero', () => {
    expect(ultimoMesCerrado('2026-10-19')).toBe('2026-09-01');
    expect(ultimoMesCerrado('2026-10-01')).toBe('2026-09-01');
    expect(ultimoMesCerrado('2027-01-31')).toBe('2026-12-01');
  });
});

describe('barrasCascada', () => {
  const paso = (tipo: PasoCascada['tipo'], importe: string, inicio: string, fin: string): PasoCascada => ({
    tipo,
    nombre: tipo === 'categoria' ? 'Ocio' : null,
    clave: null,
    color: null,
    importe,
    inicio,
    fin,
  });

  it('balance positivo: el eje va de 0 a los ingresos y cada gasto baja desde el acumulado', () => {
    const { barras, cero } = barrasCascada([
      paso('ingresos', '1000.00', '0.00', '1000.00'),
      paso('categoria', '-750.00', '1000.00', '250.00'),
      paso('balance', '250.00', '0.00', '250.00'),
    ]);
    expect(cero).toBe(0);
    expect(barras.map((b) => b.sentido)).toEqual(['total', 'baja', 'total']);
    expect(barras[0]).toMatchObject({ abajo: 0, alto: 100 });
    expect(barras[1]).toMatchObject({ abajo: 25, alto: 75 });
    expect(barras[2]).toMatchObject({ abajo: 0, alto: 25 });
  });

  it('balance negativo: el cero queda por encima del fondo y el balance baja por debajo', () => {
    const { barras, cero } = barrasCascada([
      paso('ingresos', '300.00', '0.00', '300.00'),
      paso('categoria', '-400.00', '300.00', '-100.00'),
      paso('balance', '-100.00', '0.00', '-100.00'),
    ]);
    expect(cero).toBe(25);
    expect(barras[2]).toMatchObject({ abajo: 0, alto: 25 });
  });

  it('una categoría con más devoluciones que gasto sube', () => {
    const { barras } = barrasCascada([
      paso('ingresos', '100.00', '0.00', '100.00'),
      paso('categoria', '30.00', '100.00', '130.00'),
      paso('balance', '130.00', '0.00', '130.00'),
    ]);
    expect(barras[1]?.sentido).toBe('sube');
  });
});
