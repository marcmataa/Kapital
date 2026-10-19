import { ArrowLeftRight, ChartColumn, House, Settings, Sparkles, type LucideIcon } from 'lucide-react';
import type { ClaveDe } from '@/shared/i18n';

export interface ItemNav {
  ruta: string;
  clave: ClaveDe<'common'>;
  Icono: LucideIcon;
  /** Solo activo con coincidencia exacta (para '/'). */
  exacta?: boolean;
}

export const NAV_INICIO: ItemNav = { ruta: '/', clave: 'nav.inicio', Icono: House, exacta: true };
export const NAV_MOVIMIENTOS: ItemNav = { ruta: '/movimientos', clave: 'nav.movimientos', Icono: ArrowLeftRight };
export const NAV_ESTADISTICAS: ItemNav = { ruta: '/estadisticas', clave: 'nav.estadisticas', Icono: ChartColumn };
export const NAV_ANALISIS: ItemNav = { ruta: '/analisis', clave: 'nav.analisis', Icono: Sparkles };
export const NAV_CONFIGURACION: ItemNav = { ruta: '/configuracion', clave: 'nav.configuracion', Icono: Settings };

/** Sidebar de escritorio. */
export const NAV_ESCRITORIO: readonly ItemNav[] = [
  NAV_INICIO,
  NAV_MOVIMIENTOS,
  NAV_ESTADISTICAS,
  NAV_ANALISIS,
  NAV_CONFIGURACION,
];

/** Lo que agrupa «Más» en el móvil. */
export const NAV_MAS: readonly ItemNav[] = [NAV_ANALISIS, NAV_CONFIGURACION];

export const RUTA_NUEVO_MOVIMIENTO = '/movimientos/nuevo';
