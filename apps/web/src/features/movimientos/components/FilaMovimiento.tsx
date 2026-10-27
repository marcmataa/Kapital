import { useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { EyeOff, Pencil, Trash2 } from 'lucide-react';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import type { Catalogos } from '../hooks/useCatalogos';
import { CLASE_TONO, importeConSigno, tonoImporte } from '../lib/presentacion';
import type { Movimiento } from '../lib/tipos';
import { DialogoBorrar } from './DialogoBorrar';
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

/** Ancho de las acciones que aparecen al deslizar la fila (Editar + Borrar). */
export const ANCHO_ACCIONES = 152;
/** Movimiento mínimo (px) para decidir si el gesto es horizontal (deslizar) o vertical (scroll). */
const UMBRAL_GESTO = 8;

function esEscritorio(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(CONSULTA_ESCRITORIO).matches
    : false;
}

export interface MetaMovimiento {
  texto: string;
  /** Traspasos y ajustes: no cuentan en el balance (se indica con un icono + texto oculto). */
  fueraDelBalance: string | null;
}

/**
 * Texto secundario de la fila (sin la fecha: va en la cabecera del día): «Ocio · Bizum»,
 * «BBVA → Efectivo» o «Ajuste · BBVA». Traspasos y ajustes llevan además la explicación de que no
 * cuentan en el balance, que la fila muestra como icono (el texto queda para lectores de pantalla).
 */
export function useMetaMovimiento() {
  const t = useT('movimientos');
  const nombreCategoria = useNombreCategoria();
  const nombreCuenta = useNombreCuenta();
  return (m: Movimiento, catalogos: Pick<Catalogos, 'cuentaPorId' | 'categoriaPorId'>): MetaMovimiento => {
    const cuenta = (id: string | null) => {
      const c = id === null ? undefined : catalogos.cuentaPorId.get(id);
      return c ? nombreCuenta(c) : '—';
    };
    if (m.tipo === 'traspaso') {
      return {
        texto: t('meta.traspaso', { origen: cuenta(m.cuenta_id), destino: cuenta(m.cuenta_destino_id) }),
        fueraDelBalance: t('meta.noCuenta'),
      };
    }
    if (m.tipo === 'ajuste') {
      return { texto: t('meta.ajuste', { cuenta: cuenta(m.cuenta_id) }), fueraDelBalance: t('meta.aparte') };
    }
    const categoria = catalogos.categoriaPorId.get(m.categoria_id ?? '');
    const partes = [categoria ? nombreCategoria(categoria) : t('meta.sinCategoria')];
    if (m.metodo !== null) partes.push(t(`metodo.${m.metodo}`));
    return { texto: partes.join(' · '), fueraDelBalance: null };
  };
}

/**
 * Fila de la lista. En móvil se puede deslizar a la izquierda para ver «Editar» y «Borrar»
 * (borrar pide confirmación). Las mismas acciones están en el detalle, que es el camino accesible
 * con teclado y lector de pantalla: mientras están ocultas, las acciones son `inert`.
 */
export function FilaMovimiento({ movimiento: m, catalogos, seleccionado, href, onSeleccionar }: Props) {
  const { locale } = useIdioma();
  const t = useT('movimientos');
  const meta = useMetaMovimiento()(m, catalogos);
  const tono = tonoImporte(m);

  // Las cuentas cerradas no admiten cambios (proteger_cuenta_cerrada): sin acciones al deslizar.
  const deslizable = [m.cuenta_id, m.cuenta_destino_id].every(
    (id) => id === null || catalogos.cuentaPorId.get(id)?.fecha_cierre == null,
  );
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const gesto = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const huboArrastre = useRef(false);
  const abierta = desplazamiento <= -ANCHO_ACCIONES;

  const alEmpezar = (e: TouchEvent) => {
    const toque = e.touches[0];
    if (!deslizable || !toque) return;
    gesto.current = { x: toque.clientX, y: toque.clientY, base: desplazamiento, horizontal: null };
    huboArrastre.current = false;
  };

  const alMover = (e: TouchEvent) => {
    const g = gesto.current;
    const toque = e.touches[0];
    if (!g || !toque) return;
    const dx = toque.clientX - g.x;
    const dy = toque.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < UMBRAL_GESTO && Math.abs(dy) < UMBRAL_GESTO) return;
      g.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!g.horizontal) return;
    huboArrastre.current = true;
    setArrastrando(true);
    setDesplazamiento(Math.max(-ANCHO_ACCIONES, Math.min(0, g.base + dx)));
  };

  const alSoltar = () => {
    if (gesto.current?.horizontal) {
      setDesplazamiento((d) => (d < -ANCHO_ACCIONES / 2 ? -ANCHO_ACCIONES : 0));
    }
    gesto.current = null;
    setArrastrando(false);
  };

  const alPulsar = (e: MouseEvent<HTMLAnchorElement>) => {
    // Un deslizamiento no es un toque: no abre el detalle. Con la fila abierta, tocarla la cierra.
    if (huboArrastre.current || desplazamiento !== 0) {
      e.preventDefault();
      huboArrastre.current = false;
      setDesplazamiento(0);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (esEscritorio()) {
      e.preventDefault();
      onSeleccionar(m.id);
    }
  };

  return (
    <li className="relative overflow-hidden rounded-xl">
      {deslizable && (
        <div
          inert={!abierta}
          data-testid="acciones-fila"
          // Con la fila en reposo, el panel se oculta del todo: si no, sus colores asomaban por las
          // esquinas redondeadas de la fila como unos arcos en el borde derecho (auditoría F12).
          className={cx('absolute inset-y-0 right-0 flex lg:hidden', desplazamiento === 0 && !arrastrando && 'invisible')}
          style={{ width: ANCHO_ACCIONES }}
        >
          <Link
            to={`/movimientos/${m.id}/editar`}
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-superficie-3 text-xs font-medium text-texto"
          >
            <Pencil aria-hidden="true" className="size-4" />
            {t('detalle.editar')}
          </Link>
          <button
            type="button"
            onClick={() => setBorrando(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 bg-negativo text-xs font-medium text-white"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {t('detalle.borrar')}
          </button>
        </div>
      )}
      <Link
        to={href}
        onClick={alPulsar}
        onTouchStart={alEmpezar}
        onTouchMove={alMover}
        onTouchEnd={alSoltar}
        onTouchCancel={alSoltar}
        aria-current={seleccionado ? 'true' : undefined}
        style={desplazamiento === 0 ? undefined : { transform: `translateX(${desplazamiento}px)` }}
        className={cx(
          'relative flex min-h-14 w-full touch-pan-y items-center gap-3 rounded-xl bg-superficie px-3 py-2.5 text-left',
          !arrastrando && 'transition-[transform,background-color] duration-200',
          'hover:bg-superficie-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-acento',
          seleccionado && 'lg:bg-acento-suave',
        )}
      >
        <IconoMovimiento tipo={m.tipo} categoria={catalogos.categoriaPorId.get(m.categoria_id ?? '')} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] break-words text-texto">
            <span className="sr-only">{t(`tipo.${m.tipo}`)}: </span>
            {m.concepto}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-apagado">
            <span className="truncate">{meta.texto}</span>
            {meta.fueraDelBalance !== null && (
              <span className="inline-flex shrink-0 items-center" title={meta.fueraDelBalance}>
                <EyeOff aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{meta.fueraDelBalance}</span>
              </span>
            )}
          </span>
        </span>
        <span className={cx('shrink-0 text-[15px] tabular-nums', CLASE_TONO[tono])}>{importeConSigno(m, locale)}</span>
      </Link>
      {borrando && (
        <DialogoBorrar
          movimiento={m}
          abierto
          onCerrar={() => setBorrando(false)}
          onBorrado={() => {
            setBorrando(false);
            setDesplazamiento(0);
          }}
        />
      )}
    </li>
  );
}
