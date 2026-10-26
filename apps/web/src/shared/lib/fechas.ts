/**
 * Fechas de calendario ('YYYY-MM-DD') en la zona del usuario (por defecto Europe/Madrid).
 * Una fecha de movimiento es un día civil, no un instante: se formatea en UTC para que
 * ninguna zona horaria la mueva de día.
 */

export const ZONA_POR_DEFECTO = 'Europe/Madrid';

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface PartesFecha {
  anio: number;
  mes: number; // 1-12
  dia: number;
}

export function partesDe(fecha: string): PartesFecha {
  const m = FECHA.exec(fecha);
  if (!m) throw new Error('fecha_invalida');
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

function dosCifras(n: number): string {
  return n.toString().padStart(2, '0');
}

export function componerFecha({ anio, mes, dia }: PartesFecha): string {
  return `${anio.toString().padStart(4, '0')}-${dosCifras(mes)}-${dosCifras(dia)}`;
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Día civil de `instante` en `zona` ('YYYY-MM-DD'). */
export function fechaEnZona(instante: Date, zona: string = ZONA_POR_DEFECTO): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Hoy en la zona del usuario. */
export function hoy(zona: string = ZONA_POR_DEFECTO, ahora: Date = new Date()): string {
  return fechaEnZona(ahora, zona);
}

/** Primer día del mes de `fecha` ('2026-10-17' → '2026-10-01'). */
export function inicioDeMes(fecha: string): string {
  const { anio, mes } = partesDe(fecha);
  return componerFecha({ anio, mes, dia: 1 });
}

export function finDeMes(fecha: string): string {
  const { anio, mes } = partesDe(fecha);
  return componerFecha({ anio, mes, dia: diasDelMes(anio, mes) });
}

/** Rango [desde, hasta] (ambos incluidos) del mes de `fecha`. */
export function rangoDeMes(fecha: string): { desde: string; hasta: string } {
  return { desde: inicioDeMes(fecha), hasta: finDeMes(fecha) };
}

/** Suma `n` meses al mes de `fecha` y devuelve el día 1 de ese mes. */
export function sumarMeses(fecha: string, n: number): string {
  const { anio, mes } = partesDe(fecha);
  const total = anio * 12 + (mes - 1) + n;
  return componerFecha({ anio: Math.floor(total / 12), mes: (total % 12) + 1, dia: 1 });
}

/**
 * Mismo día del mes anterior, ajustado al último día si no existe
 * (reglas, sección 11: 31/10 → 30/09; 29/03/2027 → 28/02/2027).
 */
export function mismoDiaMesAnterior(fecha: string): string {
  const { dia } = partesDe(fecha);
  const anterior = partesDe(sumarMeses(fecha, -1));
  return componerFecha({ ...anterior, dia: Math.min(dia, diasDelMes(anterior.anio, anterior.mes)) });
}

export function sumarDias(fecha: string, n: number): string {
  const { anio, mes, dia } = partesDe(fecha);
  const d = new Date(Date.UTC(anio, mes - 1, dia + n));
  return componerFecha({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() });
}

function comoUtc(fecha: string): Date {
  const { anio, mes, dia } = partesDe(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

export type EstiloFecha = 'corta' | 'media' | 'larga';

const OPCIONES_ESTILO: Record<EstiloFecha, Intl.DateTimeFormatOptions> = {
  corta: { day: '2-digit', month: '2-digit', year: 'numeric' }, // 17/10/2026
  media: { day: 'numeric', month: 'short', year: 'numeric' }, // 17 oct 2026
  larga: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
};

/*
 * Meses abreviados propios (sin el punto ni la preposición de Intl): los datos de Intl cambian
 * entre navegadores y versiones (Safari del iPhone y Chrome de escritorio no coinciden: «sep» /
 * «sept», «d’oct.» / «oct.»), y la fecha corta debe verse igual en móvil y en escritorio.
 */
const MESES_CORTOS: Record<'es' | 'en' | 'ca', readonly string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ca: ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'],
};

function idiomaDeLocale(locale: string): 'es' | 'en' | 'ca' {
  const base = locale.slice(0, 2).toLowerCase();
  return base === 'en' || base === 'ca' ? base : 'es';
}

/**
 * Fecha corta de día y mes, la única de la app: '2026-10-14' → '14 oct' (es), '14 Oct' (en),
 * '14 oct' (ca). Igual en todos los navegadores.
 */
export function formatearDiaMes(fecha: string, locale: string): string {
  const { mes, dia } = partesDe(fecha);
  const nombre = MESES_CORTOS[idiomaDeLocale(locale)][mes - 1];
  if (nombre === undefined) throw new Error('fecha_invalida');
  return `${dia} ${nombre}`;
}

/** Formatea un día civil ('YYYY-MM-DD') en el idioma dado. */
export function formatearFecha(fecha: string, locale: string, estilo: EstiloFecha = 'media'): string {
  return new Intl.DateTimeFormat(locale, { ...OPCIONES_ESTILO[estilo], timeZone: 'UTC' }).format(comoUtc(fecha));
}

/** '2026-10-01' → 'octubre de 2026' (es). */
export function formatearMes(fecha: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(comoUtc(fecha));
}

/** Timestamp técnico (timestamptz ISO) → fecha y hora en la zona del usuario. */
export function formatearFechaHora(instante: string, locale: string, zona: string = ZONA_POR_DEFECTO): string {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) throw new Error('fecha_invalida');
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zona,
  }).format(d);
}
