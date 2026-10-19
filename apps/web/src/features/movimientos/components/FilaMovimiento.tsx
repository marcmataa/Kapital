import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import type { Catalogos } from '../hooks/useCatalogos';
import { CLASE_TONO, diaCorto, importeConSigno, tonoImporte } from '../lib/presentacion';
import type { Movimiento } from '../lib/tipos';
import { IconoMovimiento } from './IconoMovimiento';

interface Props {
  movimiento: Movimiento;
  catalogos: Pick<Catalogos, 'cuentaPorId' | 'categoriaPorId'>;
  seleccionado: boolean;
  /** Enlace al detalle (página en móvil). */
  href: string;
  /** En escritorio el clic selecciona la fila y abre el panel lateral en vez de navegar. */
  onSeleccionar: (id: string) => void;
}

/** Breakpoint `lg` de Tailwind: a partir de aquí el detalle es un panel junto a la lista. */
export const CONSULTA_ESCRITORIO = '(min-width: 64rem)';

function esEscritorio(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(CONSULTA_ESCRITORIO).matches
    : false;
}

/** Texto secundario de la fila: «14 oct · Ocio · Bizum», o la explicación en traspasos y ajustes. */
export function useMetaMovimiento() {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  return (m: Movimiento, catalogos: Pick<Catalogos, 'cuentaPorId' | 'categoriaPorId'>): string => {
    const dia = diaCorto(m.fecha, locale);
    const cuenta = (id: string | null) => (id === null ? '—' : (catalogos.cuentaPorId.get(id)?.nombre ?? '—'));
    if (m.tipo === 'traspaso') {
      return `${dia} · ${t('meta.traspaso', { origen: cuenta(m.cuenta_id), destino: cuenta(m.cuenta_destino_id) })}`;
    }
    if (m.tipo === 'ajuste') return `${dia} · ${t('meta.ajuste', { cuenta: cuenta(m.cuenta_id) })}`;
    const partes = [dia, catalogos.categoriaPorId.get(m.categoria_id ?? '')?.nombre ?? t('meta.sinCategoria')];
    if (m.metodo !== null) partes.push(t(`metodo.${m.metodo}`));
    return partes.join(' · ');
  };
}

export function FilaMovimiento({ movimiento: m, catalogos, seleccionado, href, onSeleccionar }: Props) {
  const { locale } = useIdioma();
  const t = useT('movimientos');
  const meta = useMetaMovimiento();
  const tono = tonoImporte(m);

  const alPulsar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (esEscritorio()) {
      e.preventDefault();
      onSeleccionar(m.id);
    }
  };

  return (
    <li>
      <Link
        to={href}
        onClick={alPulsar}
        aria-current={seleccionado ? 'true' : undefined}
        className={cx(
          'flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
          'hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento',
          seleccionado && 'lg:bg-acento-suave',
        )}
      >
        <IconoMovimiento tipo={m.tipo} categoria={catalogos.categoriaPorId.get(m.categoria_id ?? '')} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] text-texto">
            <span className="sr-only">{t(`tipo.${m.tipo}`)}: </span>
            {m.concepto}
          </span>
          <span className="truncate text-xs text-apagado">{meta(m, catalogos)}</span>
        </span>
        <span className={cx('shrink-0 text-[15px] tabular-nums', CLASE_TONO[tono])}>{importeConSigno(m, locale)}</span>
      </Link>
    </li>
  );
}
