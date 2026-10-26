/**
 * analisis-mensual: insights calculados en SQL y nombres traducidos en el prompt, y
 * validación de la salida de la IA contra los datos reales (acciones «crear_limite» y
 * menciones de límites que no existen). Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { datosAnalisisSchema, type RespuestaIA } from '../../supabase/functions/_shared/analisis/esquemas.ts';
import { generarAnalisis } from '../../supabase/functions/_shared/analisis/generar.ts';
import { construirMensajes } from '../../supabase/functions/_shared/analisis/prompt.ts';
import { normalizarImporte, validarContenido } from '../../supabase/functions/_shared/analisis/validar.ts';

function datosBase(): Record<string, unknown> {
  const resumen = {
    ingresos: '2000.00',
    gastos: '1250.50',
    devoluciones: '50.50',
    gastos_netos: '1200.00',
    balance: '800.00',
    ahorro_pct: '40.0000000000',
    ajustes: '0.00',
  };
  return {
    mes: '2026-09-01',
    mes_incompleto: false,
    idioma: 'es',
    resumen,
    resumen_mes_anterior: { ...resumen, balance: '700.00' },
    categorias: [
      { nombre: 'Ocio', clave: 'ocio', etiqueta: 'Ocio', color: '#ff0000', gasto: '40.00' },
      { nombre: 'Viajes', clave: null, etiqueta: 'Viajes', color: null, gasto: '300.00' },
    ],
    categorias_mes_anterior: [{ nombre: 'Ocio', clave: 'ocio', etiqueta: 'Ocio', color: '#ff0000', gasto: '60.00' }],
    metodos: [{ metodo: 'tarjeta', gasto: '1000.00' }],
    variacion: {
      patrimonio_inicial: '10000.00',
      patrimonio_final: '10850.00',
      balance: '800.00',
      revalorizacion: '50.00',
      ajustes: '0.00',
      saldos_iniciales: '0.00',
      variacion: '850.00',
      base: 'partida',
    },
    objetivos: [
      { tipo: 'ahorro_mensual', categoria: null, clave: null, etiqueta: null, importe: '500.00', actual: '800.00' },
      { tipo: 'limite_categoria', categoria: 'Ocio', clave: 'ocio', etiqueta: 'Ocio', importe: '50.00', actual: '40.00' },
    ],
    comparativa_categorias: [
      { nombre: 'Viajes', clave: null, etiqueta: 'Viajes', gasto: '300.00', gasto_anterior: '0.00', diferencia: '300.00', variacion_pct: null },
      { nombre: 'Ocio', clave: 'ocio', etiqueta: 'Ocio', gasto: '40.00', gasto_anterior: '60.00', diferencia: '-20.00', variacion_pct: '-33.3333333333' },
    ],
    mayor_gasto: { importe: '300.00', fecha: '2026-09-12', dia_semana: '6', categoria: 'Viajes', clave: null, etiqueta: 'Viajes', pct_gastos: '23.99' },
    fin_de_semana: {
      gasto_neto: '340.00',
      pct: '28.3333333333',
      dias: '8',
      dias_mes: '30',
      categorias: [{ nombre: 'Viajes', clave: null, etiqueta: 'Viajes', gasto_fin_de_semana: '300.00', gasto: '300.00', pct: '100.0000' }],
    },
    cascada: [],
  };
}

function datosDelPrompt(entrada: unknown): Record<string, unknown> {
  // Intl separa con espacios duros y puede usar «−»: se normalizan para comparar.
  const contenido = (construirMensajes(entrada)[1]?.content ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-');
  return JSON.parse(contenido.slice(contenido.indexOf('\n') + 1)) as Record<string, unknown>;
}

describe('prompt: nombres traducidos e insights calculados en SQL', () => {
  it('usa el nombre traducido de las categorías por defecto, nunca el de la base, en inglés y catalán', () => {
    const conEtiqueta = (idioma: string, etiqueta: string) => ({
      ...datosBase(),
      idioma,
      categorias: [{ nombre: 'Ocio', clave: 'ocio', etiqueta, color: null, gasto: '40.00' }],
      categorias_mes_anterior: [],
      comparativa_categorias: [],
      objetivos: [],
      mayor_gasto: null,
      fin_de_semana: null,
    });
    const en = datosDelPrompt(conEtiqueta('en', 'Leisure'));
    expect(en['categorias']).toEqual([{ nombre: 'Leisure', gasto: '€40.00' }]);
    expect(JSON.stringify(en)).not.toContain('Ocio');
    expect(datosDelPrompt(conEtiqueta('ca', 'Oci'))['categorias']).toEqual([{ nombre: 'Oci', gasto: '40,00 €' }]);
  });

  it('pasa la comparativa por categoría, el mayor gasto, el fin de semana y los métodos formateados', () => {
    const p = datosDelPrompt(datosBase());
    expect(p['comparativa_categorias']).toEqual([
      { nombre: 'Viajes', gasto: '300,00 €', gasto_anterior: '0,00 €', diferencia: '+300,00 €', variacion_pct: null },
      { nombre: 'Ocio', gasto: '40,00 €', gasto_anterior: '60,00 €', diferencia: '-20,00 €', variacion_pct: '-33,3 %' },
    ]);
    expect(p['mayor_gasto']).toEqual({
      importe: '300,00 €', fecha: '2026-09-12', dia_semana: 'sábado', categoria: 'Viajes', pct_gastos: '24,0 %',
    });
    expect(p['fin_de_semana']).toMatchObject({ gasto_neto: '340,00 €', pct: '28,3 %', dias: 8, dias_mes: 30 });
    expect(p['metodos']).toEqual([{ metodo: 'Tarjeta', gasto: '1.000,00 €' }]);
    expect(datosDelPrompt({ ...datosBase(), idioma: 'en' })['mayor_gasto']).toMatchObject({ dia_semana: 'Saturday' });
  });

  it('pasa los límites reales: categorías con límite y sin límite', () => {
    const p = datosDelPrompt(datosBase());
    expect(p['categorias_con_limite']).toEqual(['Ocio']);
    expect(p['categorias_sin_limite']).toEqual(['Viajes']);
  });

  it('las instrucciones prohíben hablar de límites que no existen y piden insights, en los tres idiomas', () => {
    const textos = {
      es: ['categorias_con_limite', 'crear_limite', 'comparativa_categorias', 'patrimonio de partida'],
      en: ['categorias_con_limite', 'crear_limite', 'comparativa_categorias', 'starting net worth'],
      ca: ['categorias_con_limite', 'crear_limite', 'comparativa_categorias', 'patrimoni de partida'],
    } as const;
    for (const idioma of ['es', 'en', 'ca'] as const) {
      const system = construirMensajes({ ...datosBase(), idioma })[0]?.content ?? '';
      for (const t of textos[idioma]) expect(system, `${idioma}: ${t}`).toContain(t);
      expect(system).not.toContain('destacados');
    }
  });

  it('acepta snapshots anteriores sin los campos nuevos', () => {
    const d = datosBase();
    for (const k of ['comparativa_categorias', 'mayor_gasto', 'fin_de_semana', 'cascada']) delete d[k];
    d['categorias'] = [{ nombre: 'Ocio', color: null, gasto: '1.00' }];
    const r = datosAnalisisSchema.parse(d);
    expect(r.comparativa_categorias).toEqual([]);
    expect(r.mayor_gasto).toBeNull();
    expect(r.categorias[0]).toMatchObject({ clave: null, etiqueta: null });
  });
});

describe('validarContenido: acciones y límites contra los datos reales', () => {
  const datos = () => datosAnalisisSchema.parse(datosBase());
  const respuesta = (
    recomendaciones: RespuestaIA['recomendaciones'],
    observaciones = ['Viajes fue lo que más subió.'],
  ): RespuestaIA => ({ resumen: 'Buen mes.', observaciones, recomendaciones });
  const crear = (categoria: string, importe = '250') => ({ tipo: 'crear_limite' as const, categoria, importe });

  it('normaliza la acción: nombre de la base, clave e importe con dos decimales', () => {
    const c = validarContenido(respuesta([{ texto: 'Pon un límite a Viajes.', accion: crear('viajes', '199,5') }]), datos());
    expect(c).toEqual({
      version: 2,
      resumen: 'Buen mes.',
      observaciones: ['Viajes fue lo que más subió.'],
      recomendaciones: [
        {
          texto: 'Pon un límite a Viajes.',
          accion: { tipo: 'crear_limite', categoria: 'Viajes', clave: null, etiqueta: 'Viajes', importe: '199.50' },
        },
      ],
    });
  });

  it('la acción usa el nombre traducido que vio la IA y guarda el de la base', () => {
    const d = datosBase();
    d['idioma'] = 'en';
    d['categorias'] = [{ nombre: 'Restaurantes', clave: 'restaurantes', etiqueta: 'Restaurants', color: null, gasto: '90.00' }];
    const c = validarContenido(
      respuesta([{ texto: 'Set a limit for Restaurants.', accion: crear('Restaurants', '80') }], ['Restaurants rose.']),
      datosAnalisisSchema.parse(d),
    );
    expect(c?.recomendaciones[0]?.accion).toEqual({
      tipo: 'crear_limite', categoria: 'Restaurantes', clave: 'restaurantes', etiqueta: 'Restaurants', importe: '80.00',
    });
  });

  it('descarta crear un límite que ya existe, de una categoría desconocida, repetido o con importe no válido', () => {
    const c = validarContenido(
      respuesta([
        { texto: 'Crea un límite para Ocio.', accion: crear('Ocio') },
        { texto: 'Crea un límite para Coches.', accion: crear('Coches') },
        { texto: 'Crea un límite para Viajes.', accion: crear('Viajes', '0') },
        { texto: 'Crea un límite para Viajes.', accion: crear('Viajes', '-20') },
        { texto: 'Revisa tus suscripciones.', accion: null },
      ]),
      datos(),
    );
    expect(c?.recomendaciones).toEqual([{ texto: 'Revisa tus suscripciones.', accion: null }]);
  });

  it('descarta textos que hablan de un límite o presupuesto que no existe', () => {
    const c = validarContenido(
      respuesta(
        [
          { texto: 'Ajusta tu presupuesto de Viajes.', accion: null },
          { texto: 'Revisa tu presupuesto mensual.', accion: null },
          { texto: 'Mantente por debajo de tu límite de Ocio.', accion: null },
        ],
        ['Superaste el límite de Viajes.', 'Ocio quedó dentro de su límite.'],
      ),
      datos(),
    );
    expect(c?.recomendaciones).toEqual([{ texto: 'Mantente por debajo de tu límite de Ocio.', accion: null }]);
    expect(c?.observaciones).toEqual(['Ocio quedó dentro de su límite.']);
  });

  it('sin límites, «Ocio» no casa dentro de otra palabra («negocio»)', () => {
    const d = datosBase();
    d['objetivos'] = [];
    const c = validarContenido(
      respuesta([
        { texto: 'Crear un límite para Ocio te ayudaría.', accion: crear('Ocio', '30') },
        { texto: 'Ese negocio tiene un límite propio.', accion: null },
      ]),
      datosAnalisisSchema.parse(d),
    );
    expect(c?.recomendaciones.map((r) => r.accion?.categoria ?? null)).toEqual(['Ocio']);
  });

  it('sin observaciones o recomendaciones válidas, o con un resumen incoherente → null', () => {
    expect(validarContenido(respuesta([{ texto: 'x', accion: crear('Ocio') }]), datos())).toBeNull();
    expect(validarContenido(respuesta([{ texto: 'x', accion: null }], ['Ajusta tu presupuesto.']), datos())).toBeNull();
    expect(
      validarContenido({ ...respuesta([{ texto: 'x', accion: null }]), resumen: 'Te pasaste del límite de Viajes.' }, datos()),
    ).toBeNull();
  });

  it('generarAnalisis: si solo propone límites que ya existen → respuesta_invalida', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    resumen: 'Mes normal.',
                    observaciones: ['Uno', 'Dos'],
                    recomendaciones: [
                      { texto: 'Crea un límite para Ocio.', accion: crear('Ocio') },
                      { texto: 'Sube tu límite de Viajes.', accion: null },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    await expect(generarAnalisis(datosBase(), { fetch: fetchMock, apiKey: 'sk-test-falsa' })).rejects.toMatchObject({
      codigo: 'respuesta_invalida',
    });
  });

  it('normalizarImporte', () => {
    expect(normalizarImporte('250')).toBe('250.00');
    expect(normalizarImporte('0250,5')).toBe('250.50');
    expect(normalizarImporte('1.258,00')).toBeNull();
    expect(normalizarImporte('0.00')).toBeNull();
    expect(normalizarImporte('abc')).toBeNull();
  });
});
