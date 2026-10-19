import { aCentimos, desdeCentimos, parsearImporte } from '@/shared/lib/dinero';

/** Máximo de numeric(12,2) en céntimos. */
const CENTIMOS_MAXIMOS = 999_999_999_999n;
/** Igual que `leer_saldo` (SQL): empieza por dígito y solo lleva dígitos, puntos y comas. */
const FORMATO_SALDO = /^[0-9][0-9.,]*$/;

export type ErrorSaldo = 'vacio' | 'invalido' | 'maximo';
export type ResultadoSaldo = { ok: true; valor: string } | { ok: false; error: ErrorSaldo };

/**
 * Réplica de `leer_saldo` (SQL): acepta «1.258,50», «0», «38,5 €»; rechaza signos, letras y vacíos.
 * Devuelve el saldo normalizado ('1258.50'), que es lo que se envía a la base.
 */
export function leerSaldo(texto: string): ResultadoSaldo {
  const s = texto.replaceAll('€', '').trim();
  if (s === '') return { ok: false, error: 'vacio' };
  if (!FORMATO_SALDO.test(s)) return { ok: false, error: 'invalido' };
  const valor = parsearImporte(s);
  if (valor === null) return { ok: false, error: 'invalido' };
  if (aCentimos(valor) > CENTIMOS_MAXIMOS) return { ok: false, error: 'maximo' };
  return { ok: true, valor };
}

/**
 * Patrimonio de partida (reglas, sección 4): suma exacta de los saldos iniciales de hoy,
 * en céntimos bigint. Recibe saldos ya normalizados ('1258.50') y devuelve 'd.dd'.
 */
export function sumarSaldos(saldos: readonly string[]): string {
  return desdeCentimos(saldos.reduce((total, s) => total + aCentimos(s), 0n));
}
