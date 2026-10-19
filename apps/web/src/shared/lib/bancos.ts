/** Catálogo cerrado de entidades (`cuentas.entidad`). Logos en /public/bancos/<entidad>.svg. */
export const ENTIDADES = [
  'caixabank',
  'santander',
  'bbva',
  'sabadell',
  'bankinter',
  'ing',
  'unicaja',
  'openbank',
  'revolut',
  'trade_republic',
] as const;

export type Entidad = (typeof ENTIDADES)[number];

export const NOMBRE_ENTIDAD: Record<Entidad, string> = {
  caixabank: 'CaixaBank',
  santander: 'Santander',
  bbva: 'BBVA',
  sabadell: 'Banco Sabadell',
  bankinter: 'Bankinter',
  ing: 'ING',
  unicaja: 'Unicaja',
  openbank: 'Openbank',
  revolut: 'Revolut',
  trade_republic: 'Trade Republic',
};

export const MAX_BANCOS = 5;

export function esEntidad(valor: string | null | undefined): valor is Entidad {
  return typeof valor === 'string' && (ENTIDADES as readonly string[]).includes(valor);
}

/** Iniciales para el logo de respaldo: «Caja Rural» → «CR», «abanca» → «AB». */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/u).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return Array.from(palabras[0] ?? '').slice(0, 2).join('').toUpperCase();
  return palabras
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('')
    .toUpperCase();
}
