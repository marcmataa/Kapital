import { LOCALE_DE, type Idioma } from '@/shared/i18n/tipos';
import { MAX_BANCOS, type Entidad } from '@/shared/lib/bancos';
import type { BancoElegido } from '../components/SelectorBanco';
import { leerSaldo } from '../schemas/saldo';

/** 1 idioma · 2 banco principal · 3 su saldo · 4 otros bancos · 5 efectivo · 6 resumen. */
export type Paso = 1 | 2 | 3 | 4 | 5 | 6;
export const PASOS_CON_NUMERO = 5;

export interface BancoConSaldo {
  banco: BancoElegido;
  /** Texto tal cual lo escribió el usuario; se normaliza al enviar. */
  saldo: string;
}

export interface EstadoOnboarding {
  paso: Paso;
  idioma: Idioma;
  principal: BancoElegido | null;
  saldoPrincipal: string;
  /** Otros bancos ya añadidos (paso 4), en orden. */
  extras: BancoConSaldo[];
  /** Banco elegido en el paso 4 que aún no se ha añadido a `extras`. */
  borrador: BancoElegido | null;
  saldoBorrador: string;
  efectivo: string;
  /** Se ha pulsado «Siguiente» con datos no válidos: la UI muestra los errores del paso. */
  intentoFallido: boolean;
}

export type AccionOnboarding =
  | { tipo: 'idioma'; idioma: Idioma }
  | { tipo: 'principal'; banco: BancoElegido | null }
  | { tipo: 'saldoPrincipal'; texto: string }
  | { tipo: 'borrador'; banco: BancoElegido | null }
  | { tipo: 'saldoBorrador'; texto: string }
  | { tipo: 'anadirBorrador' }
  | { tipo: 'quitarExtra'; indice: number }
  | { tipo: 'efectivo'; texto: string }
  | { tipo: 'siguiente' }
  | { tipo: 'atras' }
  | { tipo: 'saltar' };

export function estadoInicial(idioma: Idioma = 'es'): EstadoOnboarding {
  return {
    paso: 1,
    idioma,
    principal: null,
    saldoPrincipal: '',
    extras: [],
    borrador: null,
    saldoBorrador: '',
    efectivo: '0',
    intentoFallido: false,
  };
}

/** Bancos elegidos (principal + otros añadidos), sin contar el borrador. */
export function totalBancos(e: EstadoOnboarding): number {
  return (e.principal === null ? 0 : 1) + e.extras.length;
}

/** ¿Se puede añadir un banco más (además del principal y los ya añadidos)? */
export function caberMasBancos(e: EstadoOnboarding): boolean {
  return Math.max(totalBancos(e), 1) < MAX_BANCOS;
}

/** Entidades del catálogo ya elegidas en `bancos`. */
export function entidadesDe(bancos: readonly (BancoElegido | null)[]): Entidad[] {
  return bancos.flatMap((b) => (b?.entidad ? [b.entidad] : []));
}

/** ¿Los datos del paso actual permiten avanzar? */
export function pasoValido(e: EstadoOnboarding): boolean {
  switch (e.paso) {
    case 1:
      return true;
    case 2:
      return e.principal !== null;
    case 3:
      return leerSaldo(e.saldoPrincipal, LOCALE_DE[e.idioma]).ok;
    case 4:
      return e.borrador === null || leerSaldo(e.saldoBorrador, LOCALE_DE[e.idioma]).ok;
    case 5:
      return leerSaldo(e.efectivo, LOCALE_DE[e.idioma]).ok;
    case 6:
      return false;
  }
}

function aPaso(e: EstadoOnboarding, paso: Paso): EstadoOnboarding {
  return { ...e, paso, intentoFallido: false };
}

/** Añade el borrador a `extras` si su saldo es válido y cabe otro banco. */
function confirmarBorrador(e: EstadoOnboarding): EstadoOnboarding | null {
  if (e.borrador === null || !leerSaldo(e.saldoBorrador, LOCALE_DE[e.idioma]).ok || !caberMasBancos(e)) return null;
  return {
    ...e,
    extras: [...e.extras, { banco: e.borrador, saldo: e.saldoBorrador }],
    borrador: null,
    saldoBorrador: '',
  };
}

/** Reducer puro del onboarding: nada se guarda hasta «Empezar» (una sola llamada a la RPC). */
export function reducerOnboarding(e: EstadoOnboarding, a: AccionOnboarding): EstadoOnboarding {
  switch (a.tipo) {
    case 'idioma':
      return { ...e, idioma: a.idioma };
    case 'principal':
      return { ...e, principal: a.banco };
    case 'saldoPrincipal':
      return { ...e, saldoPrincipal: a.texto };
    case 'borrador':
      if (a.banco !== null && !caberMasBancos(e)) return e;
      return { ...e, borrador: a.banco, intentoFallido: false };
    case 'saldoBorrador':
      return { ...e, saldoBorrador: a.texto };
    case 'anadirBorrador': {
      const confirmado = confirmarBorrador(e);
      return confirmado === null ? { ...e, intentoFallido: true } : { ...confirmado, intentoFallido: false };
    }
    case 'quitarExtra':
      return { ...e, extras: e.extras.filter((_, i) => i !== a.indice) };
    case 'efectivo':
      return { ...e, efectivo: a.texto };
    case 'siguiente': {
      if (e.paso === 6) return e;
      if (!pasoValido(e)) return { ...e, intentoFallido: true };
      if (e.paso === 4 && e.borrador !== null) {
        const confirmado = confirmarBorrador(e);
        return confirmado === null ? { ...e, intentoFallido: true } : aPaso(confirmado, 5);
      }
      return aPaso(e, (e.paso + 1) as Paso);
    }
    case 'atras':
      return e.paso === 1 ? e : aPaso(e, (e.paso - 1) as Paso);
    case 'saltar':
      return e.paso === 4 ? aPaso({ ...e, borrador: null, saldoBorrador: '' }, 5) : e;
  }
}

export interface BancoPayload {
  entidad: Entidad | null;
  nombre: string;
  color: string | null;
  saldo: string;
}

export interface PayloadOnboarding {
  p_idioma: Idioma;
  p_bancos: BancoPayload[];
  p_efectivo: string;
}

/**
 * Argumentos de `completar_onboarding` con los saldos normalizados ('1258.50').
 * El primer banco es el principal. null si falta algún dato o hay un saldo no válido.
 */
export function construirPayload(e: EstadoOnboarding): PayloadOnboarding | null {
  if (e.principal === null) return null;
  const bancos = [{ banco: e.principal, saldo: e.saldoPrincipal }, ...e.extras];
  if (bancos.length > MAX_BANCOS) return null;
  const efectivo = leerSaldo(e.efectivo, LOCALE_DE[e.idioma]);
  if (!efectivo.ok) return null;
  const p_bancos: BancoPayload[] = [];
  for (const { banco, saldo } of bancos) {
    const leido = leerSaldo(saldo, LOCALE_DE[e.idioma]);
    if (!leido.ok) return null;
    p_bancos.push({
      entidad: banco.entidad,
      nombre: banco.nombre,
      color: banco.color,
      saldo: leido.valor,
    });
  }
  return { p_idioma: e.idioma, p_bancos, p_efectivo: efectivo.valor };
}
