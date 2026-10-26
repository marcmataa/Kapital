import type { ErrorApi } from '@/app/api';
import type { ClaveDe } from '@/shared/i18n';
import { IMPORTE_MAXIMO, aCentimos, compararImportes, parsearImporteLocal } from '@/shared/lib/dinero';

/**
 * Saldo real escrito por el usuario («¿Cuánto tienes ahora en BBVA?») → 'dddd.dd' con signo
 * ('-20.00' en un descubierto), leído con el idioma activo. Al contrario que un importe, aquí el
 * signo importa: se lee aparte y el resto con `parsearImporteLocal`. null si no se puede leer o
 * no cabe en numeric(12,2). La diferencia con la app NO se calcula aquí: la calcula la base.
 */
export function leerSaldoReal(texto: string, locale: string): string | null {
  const limpio = texto.trim();
  const negativo = limpio.startsWith('-') || limpio.startsWith('−');
  const resto = negativo ? limpio.slice(1) : limpio;
  if (/[-−]/.test(resto)) return null;
  const valor = parsearImporteLocal(resto, locale);
  if (valor === null || compararImportes(valor, IMPORTE_MAXIMO) > 0) return null;
  return negativo && aCentimos(valor) !== 0n ? `-${valor}` : valor;
}

type ClaveAjuste = Extract<ClaveDe<'movimientos'>, `ajuste.error.${string}` | 'error.red' | 'error.generico'>;

const CLAVES: Record<string, ClaveAjuste> = {
  cuenta_no_valida: 'ajuste.error.cuenta',
  cuenta_cerrada: 'ajuste.error.cuentaCerrada',
  cuenta_inversion: 'ajuste.error.inversion',
  fecha_no_valida: 'ajuste.error.fecha',
  saldo_no_valido: 'ajuste.error.saldo',
  nota_obligatoria: 'ajuste.error.nota',
};

/** Errores de calcular_ajuste / crear_ajuste (22023 + código en el mensaje) → clave de texto. */
export function claveErrorAjuste(error: unknown): ClaveAjuste {
  if (typeof error === 'object' && error !== null && 'codigo' in error) {
    const e = error as ErrorApi;
    if (e.codigo === 'red') return 'error.red';
    if (e.mensaje !== undefined && e.mensaje in CLAVES) return CLAVES[e.mensaje] ?? 'error.generico';
  }
  return 'error.generico';
}
