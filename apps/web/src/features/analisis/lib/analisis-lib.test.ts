import { describe, expect, it } from 'vitest';
import type { FilaAnalisis } from '../schemas/esquemas';
import { claveErrorAnalisis, codigoErrorFuncion } from './errores';
import { entradasMeses, esGenerable, mesDeRuta, rutaDeMes } from './meses';

const fila = (mes: string, estado: FilaAnalisis['estado'] = 'listo'): FilaAnalisis => ({
  id: `id-${mes}`,
  mes,
  estado,
  mes_incompleto: false,
  regeneraciones: 0,
  generado_at: null,
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
    expect(claveErrorAnalisis('en_curso')).toBe('error.enCurso');
    expect(claveErrorAnalisis('generacion_fallida')).toBe('error.generacion');
    expect(claveErrorAnalisis('red')).toBe('error.red');
    expect(claveErrorAnalisis('error_interno')).toBe('error.generico');
  });
});
