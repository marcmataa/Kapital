import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cx } from '@/shared/lib/cx';
import type { VariacionStat } from '@/shared/ui';

interface Props {
  titulo: string;
  /** Valor ya formateado ('2.458,32 €'). */
  valor: string;
  /** Color de la cifra (p. ej. un balance negativo en rojo, sección 3). */
  tonoValor?: 'negativo';
  variacion?: VariacionStat | undefined;
  /** Texto cuando no hay variación (p. ej. «Sin datos del mes anterior»). */
  pie?: ReactNode;
  /** El patrimonio: ocupa toda la fila en móvil y su cifra es la protagonista. */
  destacado?: boolean;
  /**
   * Una fila de la tarjeta del mes en escritorio (Ingresos − Gastos netos = Balance): título y
   * variación a la izquierda, cifra a la derecha. En el móvil, igual que el resto.
   */
  agrupado?: boolean;
  /** El balance: resultado de la tarjeta del mes, separado de las filas de arriba con una línea más marcada. */
  resultado?: boolean;
  children?: ReactNode;
}

const FLECHA = { sube: ArrowUp, baja: ArrowDown, igual: Minus } as const;

function colorVariacion({ tendencia, subirEsBueno = true }: VariacionStat): string {
  if (tendencia === 'igual') return 'text-apagado';
  return (tendencia === 'sube') === subirEsBueno ? 'text-positivo' : 'text-negativo';
}

/**
 * Una cifra del resumen de Inicio.
 * - Móvil: las cuatro viven dentro de UNA tarjeta (la de `TarjetasKpi`): el patrimonio a todo el
 *   ancho y, debajo, Ingresos · Gastos · Balance en tres columnas compactas.
 * - Escritorio (lg): el patrimonio es su propia tarjeta; las otras tres son filas de la tarjeta
 *   del mes (`agrupado`).
 */
export function KpiMes({
  titulo,
  valor,
  tonoValor,
  variacion,
  pie,
  destacado = false,
  agrupado = false,
  resultado = false,
  children,
}: Props) {
  const Flecha = FLECHA[variacion?.tendencia ?? 'igual'];
  return (
    <article
      className={cx(
        'flex min-w-0 flex-col',
        agrupado
          ? // Rejilla de dos columnas: [título / variación / extra] | cifra a la derecha.
            cx(
              'col-span-1 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-x-4 lg:border-t lg:py-4 lg:first:border-t-0',
              resultado ? 'lg:border-borde-fuerte' : 'lg:border-borde',
            )
          : 'lg:rounded-2xl lg:border lg:border-borde lg:bg-superficie lg:p-5 lg:shadow-tarjeta',
        destacado ? 'col-span-3 border-b border-borde pb-4 lg:col-span-1 lg:pb-5' : !agrupado && 'col-span-1',
      )}
    >
      <h3 className={cx('text-apagado', destacado ? 'text-sm' : 'text-xs leading-snug lg:text-sm', agrupado && 'lg:col-start-1')}>
        {titulo}
      </h3>
      <p
        className={cx(
          'cifras mt-1 font-semibold tracking-tight lg:text-2xl xl:text-3xl',
          agrupado && 'lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0 lg:text-right',
          destacado ? 'truncate text-4xl' : 'text-sm break-words min-[400px]:text-base sm:text-lg',
          tonoValor === 'negativo' ? 'text-negativo' : 'text-texto',
        )}
      >
        {valor}
      </p>
      {variacion ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs">
          <span className={cx('inline-flex items-center gap-0.5 font-medium', colorVariacion(variacion))}>
            <Flecha aria-hidden="true" className="size-3.5" />
            <span className="cifras">{variacion.texto}</span>
          </span>
          {/* «vs 1–26 sept»: en el móvil se quita para que las cifras respiren; en escritorio, sí. */}
          {variacion.contexto !== undefined && <span className="hidden text-apagado lg:inline">{variacion.contexto}</span>}
        </p>
      ) : (
        pie !== undefined && <p className="mt-1 text-xs text-apagado">{pie}</p>
      )}
      {children}
    </article>
  );
}
