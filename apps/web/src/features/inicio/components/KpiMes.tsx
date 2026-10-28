import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, ChevronRight, Minus } from 'lucide-react';
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
   * Una fila de la tarjeta del mes (Ingresos − Gastos netos = Balance): título y variación a la
   * izquierda, cifra a la derecha. Igual en el móvil (lista vertical compacta) y en escritorio.
   */
  agrupado?: boolean;
  /** El balance: resultado de la tarjeta del mes, separado de las filas de arriba con una línea más marcada. */
  resultado?: boolean;
  /** Botón (i) junto al título (p. ej. por qué el patrimonio no cambia lo mismo que el balance). */
  ayuda?: ReactNode;
  /** Movimientos que explican la cifra: el título enlaza ahí (auditoría F08). */
  enlace?: string;
  /** Texto de ayuda del enlace (title): «Ver los movimientos». */
  etiquetaEnlace?: string;
  children?: ReactNode;
}

const FLECHA = { sube: ArrowUp, baja: ArrowDown, igual: Minus } as const;

function colorVariacion({ tendencia, subirEsBueno = true }: VariacionStat): string {
  if (tendencia === 'igual') return 'text-apagado';
  return (tendencia === 'sube') === subirEsBueno ? 'text-positivo' : 'text-negativo';
}

/**
 * Una cifra del resumen de Inicio.
 * - Móvil: las cuatro viven dentro de UNA tarjeta (la de `TarjetasKpi`): el patrimonio arriba y,
 *   debajo, Ingresos · Gastos · Balance como lista compacta (una fila cada una; en tres columnas
 *   quedaban apretadas).
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
  ayuda,
  enlace,
  etiquetaEnlace,
  children,
}: Props) {
  const Flecha = FLECHA[variacion?.tendencia ?? 'igual'];
  return (
    <article
      className={cx(
        'min-w-0',
        agrupado
          ? // Rejilla de dos columnas: [título / variación / extra] | cifra a la derecha.
            cx(
              'grid grid-cols-[1fr_auto] items-center gap-x-4 border-t py-3 first:border-t-0 lg:py-4',
              resultado ? 'border-borde-fuerte' : 'border-borde',
            )
          : 'flex flex-col lg:rounded-2xl lg:border lg:border-borde lg:bg-superficie lg:p-5 lg:shadow-tarjeta',
        destacado && 'border-b border-borde pb-4 lg:border-b-0 lg:pb-5',
      )}
    >
      <div className={cx('flex items-center gap-1', agrupado && 'col-start-1')}>
        <h3 className="text-sm text-apagado">
          {enlace === undefined ? (
            titulo
          ) : (
            <Link
              to={enlace}
              title={etiquetaEnlace}
              className="-mx-1 inline-flex items-center gap-0.5 rounded px-1 hover:text-texto hover:underline focus-visible:outline-2 focus-visible:outline-acento"
            >
              {titulo}
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </Link>
          )}
        </h3>
        {ayuda}
      </div>
      <p
        className={cx(
          'cifras font-semibold tracking-tight lg:text-2xl xl:text-3xl',
          agrupado ? 'col-start-2 row-span-3 row-start-1 text-right' : 'mt-1',
          destacado ? 'truncate text-4xl' : 'text-lg',
          tonoValor === 'negativo' ? 'text-negativo' : 'text-texto',
        )}
      >
        {valor}
      </p>
      {variacion ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[13px]">
          <span className={cx('inline-flex items-center gap-0.5 font-medium', colorVariacion(variacion))}>
            <Flecha aria-hidden="true" className="size-3.5" />
            <span className="cifras">{variacion.texto}</span>
          </span>
          {/* «vs 27/09», «vs 1–26 sept»: siempre, también en el móvil; un «−7,8 %» solo no se entiende. */}
          {variacion.contexto !== undefined && <span className="text-apagado">{variacion.contexto}</span>}
        </p>
      ) : (
        pie !== undefined && <p className="mt-1 text-[13px] text-apagado">{pie}</p>
      )}
      {children}
    </article>
  );
}
