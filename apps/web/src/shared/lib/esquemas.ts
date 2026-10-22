import { z } from 'zod';
import { importePositivo } from './dinero';

/**
 * Importe escrito por el usuario → string 'dddd.dd' listo para la base (> 0, cabe en numeric(12,2)).
 * Se lee con el idioma activo (en inglés '1,000' son mil; en es/ca, como `leer_importe`):
 *   const esquema = z.object({ importe: esquemaImporte(tc('campo.importeInvalido'), locale) });
 */
export function esquemaImporte(mensaje: string, locale: string) {
  return z
    .string()
    .trim()
    .refine((texto) => importePositivo(texto, locale) !== null, { message: mensaje })
    .transform((texto) => importePositivo(texto, locale) ?? '');
}

/** Fecha de calendario 'YYYY-MM-DD'. */
export function esquemaFecha(mensaje: string) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: mensaje });
}
