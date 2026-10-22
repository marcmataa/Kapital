import { useState } from 'react';
import { useT } from '@/shared/i18n';
import { esEntidad, iniciales } from '@/shared/lib/bancos';
import { cx } from '@/shared/lib/cx';

interface Props {
  /** Entidad del catálogo (`cuentas.entidad`) o null para bancos «Otro». */
  entidad: string | null;
  nombre: string;
  /** Color propio (`cuentas.color`, '#rrggbb') para el respaldo con iniciales. */
  color?: string | null;
  tamano?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TAMANOS = { sm: 'size-7 text-[10px]', md: 'size-10 text-xs', lg: 'size-14 text-base' } as const;
const COLOR_HEX = /^#([0-9a-f]{6})$/i;
const COLOR_POR_DEFECTO = '#5fd3a0';

/** Texto blanco u oscuro según la luminancia del fondo (WCAG). */
export function colorTextoSobre(fondo: string): '#ffffff' | '#0b1220' {
  const m = COLOR_HEX.exec(fondo);
  if (!m?.[1]) return '#ffffff';
  const canal = (i: number) => {
    const c = Number.parseInt(m[1]?.slice(i, i + 2) ?? '00', 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return l > 0.4 ? '#0b1220' : '#ffffff';
}

/**
 * Logo del banco: el SVG oficial de /bancos/<entidad>.svg para el catálogo; iniciales sobre
 * su color si es un banco «Otro» o si el SVG no carga.
 */
export function BankLogo({ entidad, nombre, color, tamano = 'md', className }: Props) {
  const t = useT('common');
  const [fallo, setFallo] = useState(false);
  const etiqueta = t('banco.logo', { nombre });
  const clases = cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl', TAMANOS[tamano], className);

  if (esEntidad(entidad) && !fallo) {
    return (
      <img
        src={`/bancos/${entidad}.svg`}
        alt={etiqueta}
        className={cx(clases, 'bg-white object-contain p-1')}
        loading="lazy"
        decoding="async"
        onError={() => setFallo(true)}
      />
    );
  }

  const fondo = color && COLOR_HEX.test(color) ? color : COLOR_POR_DEFECTO;
  return (
    <span
      role="img"
      aria-label={etiqueta}
      className={cx(clases, 'font-semibold')}
      style={{ backgroundColor: fondo, color: colorTextoSobre(fondo) }}
    >
      <span aria-hidden="true">{iniciales(nombre)}</span>
    </span>
  );
}
