import { z } from 'zod';
import { importePositivo } from './dinero';

/**
 * Importe escrito por el usuario → string 'dddd.dd' listo para la base (> 0, cabe en numeric(12,2)).
 *   const esquema = z.object({ importe: esquemaImporte(tc('campo.importeInvalido')) });
 */
export function esquemaImporte(mensaje: string) {
  return z
    .string()
    .trim()
    .refine((texto) => importePositivo(texto) !== null, { message: mensaje })
    .transform((texto) => importePositivo(texto) ?? '');
}

/** Fecha de calendario 'YYYY-MM-DD'. */
export function esquemaFecha(mensaje: string) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: mensaje });
}
