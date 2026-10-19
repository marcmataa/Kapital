import { z } from 'zod';

/**
 * Colores de categoría: tonos medios que se distinguen sobre el fondo oscuro y el claro, y que
 * se acompañan siempre del nombre (el color nunca es la única pista). Incluye los de las
 * categorías por defecto de la base.
 */
export const COLORES_CATEGORIA = [
  '#ff8a3d',
  '#9b6bff',
  '#3b82ff',
  '#ff5fa8',
  '#8f9bbd',
  '#2fd27f',
  '#14b8a6',
  '#f2c46d',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#d946ef',
] as const;

/** Categoría que usa el atajo para los rendimientos (`registrar_movimiento`, tipo «rendimiento»). */
export const CATEGORIA_RENDIMIENTOS = 'Rendimientos';

export const NOMBRE_MAXIMO = 40;

function graficos(texto: string): number {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(texto)).length;
}

export interface MensajesCategoria {
  nombreObligatorio: string;
  nombreLargo: string;
  iconoLargo: string;
}

export function esquemaCategoria(m: MensajesCategoria) {
  return z.object({
    nombre: z.string().trim().min(1, m.nombreObligatorio).max(NOMBRE_MAXIMO, m.nombreLargo),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    icono: z
      .string()
      .trim()
      .max(16, m.iconoLargo)
      .refine((s) => graficos(s) <= 1, m.iconoLargo),
  });
}

export type FormCategoria = z.infer<ReturnType<typeof esquemaCategoria>>;
