// Esquemas zod del contrato con la base (datos_analisis) y de la salida de la IA.
// z.object elimina las claves desconocidas: lo que no está aquí nunca llega a OpenAI
// ni se guarda en el snapshot del análisis.
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
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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

/** Clave de una categoría por defecto ('ocio', 'otros_gastos'); null si la creó el usuario. */
const clave = z
  .string()
  .regex(/^[a-z_]{1,40}$/)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/**
 * Nombre en el idioma del perfil (traduccion_categoria en SQL). Opcional para los snapshots
 * anteriores a 20261024000002: si falta, se usa el nombre de la base.
 */
const etiqueta = nombreCategoria.nullable().optional().transform((v) => v ?? null);

const categoria = z.object({
  nombre: nombreCategoria,
  clave,
  etiqueta,
  color: z.string().max(20).nullable(),
  gasto: importe,
});

const metodo = z.object({
  // null: gastos sin método de pago (la columna es opcional).
  metodo: z.string().min(1).max(40).nullable(),
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
  /** 'partida': el saldo inicial de las cuentas nuevas es patrimonio de partida, no variación. */
  base: z.literal('partida').optional(),
});

const objetivo = z.object({
  tipo: z.string().min(1).max(40),
  categoria: nombreCategoria.nullable(),
  clave,
  etiqueta,
  importe: importe,
  actual: importe.nullable(),
});

const comparativa = z.object({
  nombre: nombreCategoria,
  clave,
  etiqueta,
  gasto: importe,
  gasto_anterior: importe,
  diferencia: importe,
  variacion_pct: importe.nullable(),
});

const mayorGasto = z.object({
  importe,
  fecha,
  dia_semana: z.string().regex(/^[1-7]$/),
  categoria: nombreCategoria.nullable(),
  clave,
  etiqueta,
  pct_gastos: importe.nullable(),
});

const finDeSemana = z.object({
  gasto_neto: importe,
  pct: importe.nullable(),
  dias: z.string().regex(/^\d{1,2}$/),
  dias_mes: z.string().regex(/^\d{1,2}$/),
  categorias: z
    .array(
      z.object({
        nombre: nombreCategoria,
        clave,
        etiqueta,
        gasto_fin_de_semana: importe,
        gasto: importe,
        pct: importe,
      }),
    )
    .max(5),
});

const pasoCascada = z.object({
  tipo: z.enum(['ingresos', 'categoria', 'otras', 'sin_categoria', 'balance']),
  nombre: nombreCategoria.nullable(),
  clave,
  color: z.string().max(20).nullable(),
  importe,
  inicio: importe,
  fin: importe,
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
  // Desde 20261024000002 (insights calculados en SQL). Opcionales por los snapshots antiguos.
  comparativa_categorias: z.array(comparativa).max(10).default([]),
  mayor_gasto: mayorGasto.nullable().default(null),
  fin_de_semana: finDeSemana.nullable().default(null),
  cascada: z.array(pasoCascada).max(12).default([]),
});

export type DatosAnalisis = z.infer<typeof datosAnalisisSchema>;

/** Límites de longitud de la salida de la IA. */
export const LIMITES_CONTENIDO = {
  resumen: 1200,
  item: 400,
  observaciones: { min: 2, max: 4 },
  recomendaciones: { min: 2, max: 3 },
} as const;

const texto = (max: number) => z.string().trim().min(1).max(max);

/** Acción que propone la IA. Hoy solo hay una: crear un límite para una categoría que no lo tiene. */
const accionIA = z.strictObject({
  tipo: z.literal('crear_limite'),
  /** Nombre de la categoría tal como aparece en los datos del prompt (el traducido). */
  categoria: z.string().trim().min(1).max(MAX_NOMBRE_CATEGORIA * 2),
  /** Importe mensual propuesto, como texto: '250' o '250.00'. */
  importe: z.string().trim().max(20),
});

/** Respuesta de la IA, antes de comprobarla contra los datos del mes. */
export const respuestaIASchema = z.strictObject({
  resumen: texto(LIMITES_CONTENIDO.resumen),
  observaciones: z
    .array(texto(LIMITES_CONTENIDO.item))
    .min(1)
    .max(LIMITES_CONTENIDO.observaciones.max),
  recomendaciones: z
    .array(z.strictObject({ texto: texto(LIMITES_CONTENIDO.item), accion: accionIA.nullable() }))
    .min(1)
    .max(LIMITES_CONTENIDO.recomendaciones.max),
});

export type RespuestaIA = z.infer<typeof respuestaIASchema>;

/** Acción ya validada: la categoría existe, no tiene límite y el importe es positivo. */
export interface AccionCrearLimite {
  tipo: 'crear_limite';
  /** Nombre de la categoría en la base (con él la web encuentra su id). */
  categoria: string;
  clave: string | null;
  /** Nombre en el idioma del análisis. */
  etiqueta: string;
  /** Importe normalizado ('250.00'). */
  importe: string;
}

/** Contenido que se guarda en analisis_mensuales.contenido (versión 2). */
export interface ContenidoAnalisis {
  version: 2;
  resumen: string;
  /** Lo que no se ve a simple vista en las tarjetas (comparativas, anomalías, patrones). */
  observaciones: string[];
  recomendaciones: { texto: string; accion: AccionCrearLimite | null }[];
}

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
      required: ['resumen', 'observaciones', 'recomendaciones'],
      properties: {
        resumen: { type: 'string' },
        observaciones: {
          type: 'array',
          items: { type: 'string' },
          minItems: LIMITES_CONTENIDO.observaciones.min,
          maxItems: LIMITES_CONTENIDO.observaciones.max,
        },
        recomendaciones: {
          type: 'array',
          minItems: LIMITES_CONTENIDO.recomendaciones.min,
          maxItems: LIMITES_CONTENIDO.recomendaciones.max,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['texto', 'accion'],
            properties: {
              texto: { type: 'string' },
              accion: {
                anyOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['tipo', 'categoria', 'importe'],
                    properties: {
                      tipo: { type: 'string', enum: ['crear_limite'] },
                      categoria: { type: 'string' },
                      importe: { type: 'string' },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
} as const;
