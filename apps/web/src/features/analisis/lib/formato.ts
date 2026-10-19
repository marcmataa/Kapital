import { partesDe } from '@/shared/lib/fechas';

function comoUtc(fecha: string): Date {
  const { anio, mes, dia } = partesDe(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase() + texto.slice(1);
}

/** '2026-09-01' → 'Septiembre de 2026' (es). */
export function etiquetaMes(mes: string, locale: string): string {
  return capitalizar(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(comoUtc(mes)));
}

/** '2026-09-01' → 'Septiembre' (es). */
export function nombreMes(mes: string, locale: string): string {
  return capitalizar(new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(comoUtc(mes)));
}

/** '2026-11-01' → '1/11' (es). */
export function diaMes(fecha: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(comoUtc(fecha));
}
