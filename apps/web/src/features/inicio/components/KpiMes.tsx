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
 * - Escritorio (lg): cada una es su propia tarjeta, en una fila de cuatro.
 */
export function KpiMes({ titulo, valor, tonoValor, variacion, pie, destacado = false, children }: Props) {
  const Flecha = FLECHA[variacion?.tendencia ?? 'igual'];
  return (
    <article
      className={cx(
        'flex min-w-0 flex-col lg:rounded-2xl lg:border lg:border-borde lg:bg-superficie lg:p-5 lg:shadow-tarjeta',
        destacado ? 'col-span-3 border-b border-borde pb-4 lg:col-span-1 lg:pb-5' : 'col-span-1',
      )}
    >
      <h3 className={cx('text-apagado', destacado ? 'text-sm' : 'text-xs leading-snug lg:text-sm')}>{titulo}</h3>
      <p
        className={cx(
          'cifras mt-1 font-semibold tracking-tight lg:text-2xl xl:text-3xl',
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
          {variacion.contexto !== undefined && <span className="text-apagado">{variacion.contexto}</span>}
        </p>
      ) : (
        pie !== undefined && <p className="mt-1 text-xs text-apagado">{pie}</p>
      )}
      {children}
    </article>
  );
}
