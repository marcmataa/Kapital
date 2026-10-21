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

const categoria = z.object({
  nombre: z.string().min(1).max(100),
  color: z.string().max(20).nullable(),
  gasto: importe,
});

export const esquemaDatos = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  mes_incompleto: z.boolean(),
  resumen,
  // null (o ausente) si no hay un mes anterior completo con el que comparar (sección 8).
  resumen_mes_anterior: resumen.nullish().transform((v) => v ?? null),
  categorias: z.array(categoria).max(100),
  variacion: z.object({
    patrimonio_inicial: importe,
    patrimonio_final: importe,
    balance: importe,
    revalorizacion: importe,
    ajustes: importe,
    saldos_iniciales: importe,
    variacion: importe,
  }),
});
export type DatosAnalisis = z.infer<typeof esquemaDatos>;

const texto = (max: number) => z.string().trim().min(1).max(max);

export const esquemaContenido = z.object({
  resumen: texto(1200),
  destacados: z.array(texto(400)).min(1).max(4),
  recomendaciones: z.array(texto(400)).min(1).max(3),
});
export type ContenidoAnalisis = z.infer<typeof esquemaContenido>;

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
