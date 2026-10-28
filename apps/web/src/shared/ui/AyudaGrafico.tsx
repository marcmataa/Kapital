import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

interface Props {
  /** Qué se recorre en el gráfico; sin unidad, el (i) solo lleva la definición (no es un gráfico). */
  unidad?: 'dia' | 'mes' | 'categoria';
  /** Qué mide el gráfico («Gasto neto = gastos − devoluciones…»): va antes de cómo usarlo. */
  definicion?: string;
  /** Hacia dónde se abre el texto: 'derecha' (por defecto, esquina de una tarjeta) o 'izquierda' (junto a un título). */
  alinear?: 'derecha' | 'izquierda';
  className?: string;
}

/**
 * Icono (i) con la ayuda de uso de un gráfico interactivo, en lugar de repetir el texto bajo cada
 * gráfico. Se abre al pasar el ratón, con el foco o al tocarlo. El texto depende del puntero
 * (CSS `pointer: coarse`, sin JS de media queries): en táctil «Toca o arrastra…», sin mencionar
 * ratón ni teclado; con ratón, «Pasa el ratón… o usa las flechas del teclado».
 */
export function AyudaGrafico({ unidad, definicion, alinear = 'derecha', className }: Props) {
  const t = useT('common');
  const id = useId();
  const [abierta, setAbierta] = useState(false);
  return (
    <span className={cx('group relative inline-flex', className)}>
      <button
        type="button"
        aria-label={t(unidad === undefined ? 'grafico.ayudaDefinicionEtiqueta' : 'grafico.ayudaEtiqueta')}
        aria-describedby={id}
        aria-expanded={abierta}
        onClick={() => setAbierta((a) => !a)}
        onBlur={() => setAbierta(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAbierta(false);
        }}
        className="area-tactil inline-flex size-7 items-center justify-center rounded-full text-apagado transition-colors hover:text-texto"
      >
        <Info aria-hidden="true" className="size-4" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cx(
          'absolute top-full z-10 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-borde bg-superficie-3 px-3 py-2 text-left text-xs font-normal text-texto shadow-tarjeta',
          alinear === 'derecha' ? 'right-0' : 'left-0',
          abierta ? 'block' : 'hidden group-hover:block',
        )}
      >
        {definicion !== undefined && <span className="mb-1.5 block font-semibold">{definicion}</span>}
        {unidad !== undefined && (
          <>
            <span className="pointer-coarse:hidden">{t(`grafico.ayuda.${unidad}.puntero`)}</span>
            <span className="hidden pointer-coarse:inline">{t(`grafico.ayuda.${unidad}.tactil`)}</span>
          </>
        )}
      </span>
    </span>
  );
}
