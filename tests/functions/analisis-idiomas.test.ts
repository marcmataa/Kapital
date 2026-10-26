// El análisis se genera en es, en y ca a la vez: cada versión ve los nombres de las categorías
// por defecto en su idioma, y la web elige la del idioma de la interfaz.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ContenidoAnalisis } from '../../supabase/functions/_shared/analisis/esquemas.ts';
import { datosEnIdioma, generarEnIdiomas, NOMBRES_CATEGORIA } from '../../supabase/functions/_shared/analisis/idiomas.ts';

const datos = {
  mes: '2026-09-01',
  idioma: 'es',
  categorias: [
    { nombre: 'Ocio', clave: 'ocio', etiqueta: 'Ocio', gasto: '120.00' },
    { nombre: 'Viajes', clave: null, etiqueta: 'Viajes', gasto: '300.00' },
  ],
  objetivos: [{ tipo: 'limite_categoria', categoria: 'Supermercado', clave: 'supermercado', etiqueta: 'Supermercado', importe: '50.00' }],
};

const contenido = (resumen: string): ContenidoAnalisis => ({
  version: 2,
  resumen,
  observaciones: [],
  recomendaciones: [{ texto: resumen, accion: null }],
});

describe('datosEnIdioma', () => {
  it('traduce las categorías por defecto (por clave), deja las del usuario y no toca importes', () => {
    expect(datosEnIdioma(datos, 'ca')).toEqual({
      ...datos,
      idioma: 'ca',
      categorias: [
        { nombre: 'Ocio', clave: 'ocio', etiqueta: 'Oci', gasto: '120.00' },
        { nombre: 'Viajes', clave: null, etiqueta: 'Viajes', gasto: '300.00' },
      ],
      objetivos: [{ ...datos.objetivos[0], etiqueta: 'Supermercat' }],
    });
    expect(datosEnIdioma(datos, 'en')).toMatchObject({ idioma: 'en', categorias: [{ etiqueta: 'Leisure' }, { etiqueta: 'Viajes' }] });
  });

  /** Textos 'categoria.<clave>' de la web (shared/i18n/common), leídos del fuente. */
  function textosWeb(idioma: 'es' | 'en' | 'ca'): Record<string, string> {
    const fuente = readFileSync(new URL(`../../apps/web/src/shared/i18n/common/${idioma}.ts`, import.meta.url), 'utf8');
    const textos: Record<string, string> = {};
    for (const m of fuente.matchAll(/'categoria\.([a-z_]+)':\s*'([^']+)'/g)) textos[m[1] as string] = m[2] as string;
    return textos;
  }

  it('los nombres coinciden con los de la web en los tres idiomas', () => {
    for (const idioma of ['es', 'en', 'ca'] as const) {
      const web = textosWeb(idioma);
      expect(Object.keys(web).sort()).toEqual(Object.keys(NOMBRES_CATEGORIA).sort());
      for (const [clave, nombres] of Object.entries(NOMBRES_CATEGORIA)) {
        expect(web[clave], `${clave}/${idioma}`).toBe(nombres[idioma]);
      }
    }
  });
});

describe('generarEnIdiomas', () => {
  it('genera una versión por idioma, cada una con sus datos, y las guarda juntas (versión 3)', async () => {
    const generar = vi.fn(async (d: unknown) => ({
      contenido: contenido(`resumen ${(d as { idioma: string }).idioma}`),
      modelo: 'gpt-4o-mini',
    }));
    const r = await generarEnIdiomas(datos, generar);
    expect(generar).toHaveBeenCalledTimes(3);
    expect(generar.mock.calls.map(([d]) => (d as { idioma: string }).idioma)).toEqual(['es', 'en', 'ca']);
    expect(r).toEqual({
      modelo: 'gpt-4o-mini',
      contenido: {
        version: 3,
        idiomas: { es: contenido('resumen es'), en: contenido('resumen en'), ca: contenido('resumen ca') },
      },
    });
  });

  it('si falla un idioma, falla todo (el análisis se reintenta entero)', async () => {
    const generar = vi.fn(async (d: unknown) => {
      if ((d as { idioma: string }).idioma === 'en') throw new Error('respuesta_invalida');
      return { contenido: contenido('ok'), modelo: 'm' };
    });
    await expect(generarEnIdiomas(datos, generar)).rejects.toThrow('respuesta_invalida');
  });
});
