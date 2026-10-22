import { aCentimos } from '@/shared/lib/dinero';
import { finDeMes, partesDe } from '@/shared/lib/fechas';
import type { Rango } from './periodos';

function comoUtc(fecha: string): Date {
  const { anio, mes, dia } = partesDe(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** Primera letra en mayúscula ('octubre de 2026' → 'Octubre de 2026'). */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase() + texto.slice(1);
}

/** '2026-10-01' → 'Octubre de 2026' (es). */
export function etiquetaMes(mes: string, locale: string): string {
  return capitalizar(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(comoUtc(mes)),
  );
}

/** '2026-10-01' → 'oct' (es). */
export function mesCorto(mes: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(comoUtc(mes));
}

/** '2026-10-01' → 'octubre' (es). */
export function nombreMes(mes: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(comoUtc(mes));
}

/**
 * Tramo legible: mes completo → 'octubre de 2026'; tramo parcial → '1–19 oct'.
 */
export function formatearTramo(r: Rango, locale: string): string {
  if (partesDe(r.desde).dia === 1 && r.hasta === finDeMes(r.desde)) {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(comoUtc(r.desde));
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatRange(
    comoUtc(r.desde),
    comoUtc(r.hasta),
  );
}

/** Signo de un decimal en texto, sin pasar por float. */
export function signo(valor: string): -1 | 0 | 1 {
  const c = aCentimos(valor);
  return c < 0n ? -1 : c > 0n ? 1 : 0;
}

/** Signo de un porcentaje con 4 decimales ('-7.3000'); 0 si es exactamente 0. */
export function signoPorcentaje(valor: string): -1 | 0 | 1 {
  const v = valor.trim();
  if (/^-?0+(\.0+)?$/.test(v)) return 0;
  return v.startsWith('-') ? -1 : 1;
}
