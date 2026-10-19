// Utilidades de mes en Europe/Madrid. Sin globals de Deno ni de Node.

export const ZONA_HORARIA = 'Europe/Madrid';

/** Un mes se representa como su día 1: 'YYYY-MM-01'. */
export type Mes = `${number}-${number}-01`;

const PATRON_MES = /^(\d{4})-(0[1-9]|1[0-2])-01$/;

export function esMesValido(valor: unknown): valor is Mes {
  return typeof valor === 'string' && PATRON_MES.test(valor);
}

function formatearMes(anio: number, mes: number): Mes {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01` as Mes;
}

function partesMes(mes: Mes): { anio: number; mes: number } {
  const m = PATRON_MES.exec(mes);
  if (!m?.[1] || !m[2]) throw new Error('mes_invalido');
  return { anio: Number(m[1]), mes: Number(m[2]) };
}

/** Mes (día 1) en Madrid al que pertenece el instante `ahora`. */
export function mesActual(ahora: Date): Mes {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(ahora);
  const anio = partes.find((p) => p.type === 'year')?.value;
  const mes = partes.find((p) => p.type === 'month')?.value;
  if (!anio || !mes) throw new Error('fecha_invalida');
  return formatearMes(Number(anio), Number(mes));
}

/** Suma (o resta, con n negativo) meses a un 'YYYY-MM-01'. */
export function sumarMeses(mes: Mes, n: number): Mes {
  const { anio, mes: m } = partesMes(mes);
  const total = anio * 12 + (m - 1) + n;
  return formatearMes(Math.floor(total / 12), (total % 12) + 1);
}

/** Mes anterior al mes en curso en Madrid. */
export function mesAnterior(ahora: Date): Mes {
  return sumarMeses(mesActual(ahora), -1);
}

/** Compara dos meses válidos ('YYYY-MM-01' ordena lexicográficamente). */
export function compararMeses(a: Mes, b: Mes): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
