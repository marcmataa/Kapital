import { z } from 'zod';

/*
 * Validación en el cliente del análisis guardado. Réplica del contrato de
 * `supabase/functions/_shared/analisis/esquemas.ts` (datos_analisis y salida de la IA):
 * si la fila no lo cumple, la UI muestra un error genérico en lugar de romperse.
 * Importes siempre como texto exacto, nunca números JSON.
 */

const importe = z.string().max(64).regex(/^-?\d+(\.\d+)?$/);

const resumen = z.object({
  ingresos: importe,
  gastos: importe,
  devoluciones: importe,
  gastos_netos: importe,
  balance: importe,
  ahorro_pct: importe.nullable(),
  ajustes: importe,
});
export type ResumenAnalisis = z.infer<typeof resumen>;

/** Clave de una categoría por defecto; null (o ausente en snapshots antiguos) si es del usuario. */
const clave = z.string().max(40).nullish().transform((v) => v ?? null);

const categoria = z.object({
  nombre: z.string().min(1).max(100),
  clave,
  color: z.string().max(20).nullable(),
  gasto: importe,
});

/**
 * Paso del gráfico en cascada (cascada_analisis en SQL): ingresos → una barra por categoría
 * (las 7 de más gasto, el resto en «otras») → sin categoría → balance. inicio y fin son los
 * acumulados exactos; importe lleva el signo (un gasto resta).
 */
const pasoCascada = z.object({
  tipo: z.enum(['ingresos', 'categoria', 'otras', 'sin_categoria', 'balance']),
  nombre: z.string().min(1).max(100).nullable(),
  clave,
  color: z.string().max(20).nullable(),
  importe,
  inicio: importe,
  fin: importe,
});
export type PasoCascada = z.infer<typeof pasoCascada>;

export const esquemaDatos = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  mes_incompleto: z.boolean(),
  resumen,
  // null (o ausente) si no hay un mes anterior completo con el que comparar (sección 8).
  resumen_mes_anterior: resumen.nullish().transform((v) => v ?? null),
  categorias: z.array(categoria).max(200),
  // Snapshots anteriores a 20261024000002 sin cascada: la migración la añade; si falta, [].
  cascada: z.array(pasoCascada).max(12).default([]),
  variacion: z.object({
    patrimonio_inicial: importe,
    patrimonio_final: importe,
    balance: importe,
    revalorizacion: importe,
    ajustes: importe,
    saldos_iniciales: importe,
    variacion: importe,
    /** 'partida': el saldo inicial de las cuentas nuevas es patrimonio de partida (secciones 4 y 5). */
    base: z.literal('partida').optional(),
  }),
});
export type DatosAnalisis = z.infer<typeof esquemaDatos>;

const texto = (max: number) => z.string().trim().min(1).max(max);

/** Acción propuesta por la IA y ya validada por la Edge Function contra los datos del mes. */
const accion = z.object({
  tipo: z.literal('crear_limite'),
  /** Nombre de la categoría en la base (con él se busca su id). */
  categoria: z.string().min(1).max(100),
  clave,
  etiqueta: z.string().min(1).max(100),
  importe: z.string().regex(/^\d{1,10}\.\d{2}$/),
});
export type AccionAnalisis = z.infer<typeof accion>;

/** Versión 1 (antes de 20261024000002): «Lo más destacado» ya no se muestra. */
const contenidoV1 = z
  .object({
    resumen: texto(1200),
    destacados: z.array(texto(400)).min(1).max(4),
    recomendaciones: z.array(texto(400)).min(1).max(3),
  })
  .transform((c) => ({
    resumen: c.resumen,
    observaciones: [] as string[],
    recomendaciones: c.recomendaciones.map((texto) => ({ texto, accion: null as AccionAnalisis | null })),
  }));

/** Versión 2: observaciones (insights) y recomendaciones con acción opcional. */
const contenidoV2 = z.object({
  version: z.literal(2),
  resumen: texto(1200),
  observaciones: z.array(texto(400)).max(4),
  recomendaciones: z.array(z.object({ texto: texto(400), accion: accion.nullable() })).min(1).max(3),
});

/** Un análisis en un idioma (versiones 1 y 2). */
const contenidoUnico = z.union([
  contenidoV2.transform(({ resumen, observaciones, recomendaciones }) => ({ resumen, observaciones, recomendaciones })),
  contenidoV1,
]);
export type ContenidoAnalisis = z.infer<typeof contenidoUnico>;

/** Versión 3: el mismo análisis generado en es, en y ca (se enseña el del idioma de la interfaz). */
const contenidoV3 = z.object({
  version: z.literal(3),
  idiomas: z.object({ es: contenidoUnico, en: contenidoUnico, ca: contenidoUnico }),
});

/**
 * Contenido por idioma. Los análisis anteriores a la versión 3 están en un solo idioma: se usa el
 * mismo para los tres (no se traduce nada en el cliente).
 */
export const esquemaContenido = z.union([
  contenidoV3.transform((c) => c.idiomas),
  contenidoUnico.transform((c) => ({ es: c, en: c, ca: c })),
]);
export type ContenidoPorIdioma = z.infer<typeof esquemaContenido>;

export const ESTADOS = ['pendiente', 'generando', 'listo', 'error'] as const;
export type EstadoAnalisis = (typeof ESTADOS)[number];

export const esquemaFila = z.object({
  id: z.string(),
  mes: z.string().regex(/^\d{4}-\d{2}-01$/),
  // Un estado desconocido se trata como error: nunca se muestra contenido a medias.
  estado: z.enum(ESTADOS).catch('error'),
  mes_incompleto: z.boolean(),
  regeneraciones: z.number().int(),
  /** Intentos fallidos de generación (la Edge Function reintenta mientras sean < 3). */
  intentos: z.number().int().nonnegative(),
  generado_at: z.string().nullable(),
  /** Última vez que cambió la fila: sirve para detectar un «pendiente»/«generando» atascado. */
  updated_at: z.string(),
});
export type FilaAnalisis = z.infer<typeof esquemaFila>;
