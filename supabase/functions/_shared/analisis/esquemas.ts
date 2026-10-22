// Esquemas zod del contrato con la base (datos_analisis) y de la salida de la IA.
// z.object elimina las claves desconocidas: lo que no está aquí nunca llega a OpenAI.
import { z } from 'zod';

/** Importe como texto exacto (nunca número JSON): '1508.00', '-15.5'. */
export const importe = z
  .string()
  .max(64)
  .regex(/^-?\d+(\.\d+)?$/);

export const IDIOMAS = ['es', 'en', 'ca'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const idioma = z.enum(IDIOMAS).catch('es');

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);

const resumen = z.object({
  ingresos: importe,
  gastos: importe,
  devoluciones: importe,
  gastos_netos: importe,
  balance: importe,
  ahorro_pct: importe.nullable(),
  ajustes: importe,
});

/** Mismos límites que la base (categorias_nombre_longitud y datos_analisis). */
export const MAX_NOMBRE_CATEGORIA = 40;
export const MAX_CATEGORIAS = 200;

/** Longitud en caracteres (puntos de código, como char_length en PostgreSQL), no en unidades UTF-16. */
const nombreCategoria = z
  .string()
  .min(1)
  .max(MAX_NOMBRE_CATEGORIA * 2) // cota barata: un punto de código ocupa como mucho 2 unidades UTF-16
  .refine((s) => [...s].length <= MAX_NOMBRE_CATEGORIA);

const categoria = z.object({
  nombre: nombreCategoria,
  color: z.string().max(20).nullable(),
  gasto: importe,
});

const metodo = z.object({
  metodo: z.string().min(1).max(40),
  gasto: importe,
});

const variacion = z.object({
  patrimonio_inicial: importe,
  patrimonio_final: importe,
  balance: importe,
  revalorizacion: importe,
  ajustes: importe,
  saldos_iniciales: importe,
  variacion: importe,
});

const objetivo = z.object({
  tipo: z.string().min(1).max(40),
  categoria: nombreCategoria.nullable(),
  importe: importe,
  actual: importe.nullable(),
});

export const datosAnalisisSchema = z.object({
  mes,
  mes_incompleto: z.boolean(),
  idioma,
  resumen,
  // null si no hay un mes anterior completo (sección 8); entonces categorias_mes_anterior = [].
  resumen_mes_anterior: resumen.nullable(),
  categorias: z.array(categoria).max(MAX_CATEGORIAS),
  categorias_mes_anterior: z.array(categoria).max(MAX_CATEGORIAS),
  metodos: z.array(metodo).max(20),
  variacion,
  objetivos: z.array(objetivo).max(50),
});

export type DatosAnalisis = z.infer<typeof datosAnalisisSchema>;

/** Límites de longitud de la salida de la IA. */
export const LIMITES_CONTENIDO = {
  resumen: 1200,
  item: 400,
  destacados: { min: 2, max: 4 },
  recomendaciones: { min: 2, max: 3 },
} as const;

const texto = (max: number) => z.string().trim().min(1).max(max);

export const contenidoSchema = z.strictObject({
  resumen: texto(LIMITES_CONTENIDO.resumen),
  destacados: z
    .array(texto(LIMITES_CONTENIDO.item))
    .min(LIMITES_CONTENIDO.destacados.min)
    .max(LIMITES_CONTENIDO.destacados.max),
  recomendaciones: z
    .array(texto(LIMITES_CONTENIDO.item))
    .min(LIMITES_CONTENIDO.recomendaciones.min)
    .max(LIMITES_CONTENIDO.recomendaciones.max),
});

export type ContenidoAnalisis = z.infer<typeof contenidoSchema>;

/**
 * Esquema JSON para `response_format` de OpenAI (json_schema, strict).
 * El modo estricto exige additionalProperties: false y todas las claves en required.
 * Las longitudes máximas de texto se imponen con zod al validar la respuesta.
 */
export const esquemaRespuestaOpenAI = {
  type: 'json_schema',
  json_schema: {
    name: 'analisis_mensual',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['resumen', 'destacados', 'recomendaciones'],
      properties: {
        resumen: { type: 'string' },
        destacados: {
          type: 'array',
          items: { type: 'string' },
          minItems: LIMITES_CONTENIDO.destacados.min,
          maxItems: LIMITES_CONTENIDO.destacados.max,
        },
        recomendaciones: {
          type: 'array',
          items: { type: 'string' },
          minItems: LIMITES_CONTENIDO.recomendaciones.min,
          maxItems: LIMITES_CONTENIDO.recomendaciones.max,
        },
      },
    },
  },
} as const;
