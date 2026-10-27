import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/shared/lib/cx';

interface Props {
  /** Qué está seleccionado: «3 oct 2026», «Septiembre de 2026», «Ocio». */
  titulo: string;
  /** Importe ya formateado (o un texto como «aún no ha llegado»). */
  valor: string;
  /** Líneas de detalle: ahorro, comparación con el periodo anterior… */
  children?: ReactNode;
  className?: string;
  /** Posición cuando flota sobre el gráfico. */
  style?: CSSProperties;
  'data-testid'?: string;
}

/**
 * Panel con la posición elegida de un gráfico interactivo («título · importe» y detalle debajo),
 * con el mismo estilo que la lectura del gráfico de capital de Inicio.
 */
export function LecturaGrafico({ titulo, valor, children, className, style, 'data-testid': testId }: Props) {
  return (
    <div data-testid={testId} style={style} className={cx('flex min-h-12 flex-col gap-0.5 rounded-xl bg-superficie-2 px-3 py-2', className)}>
      <span className="text-sm font-semibold text-texto">
        {titulo} · <span className="cifras">{valor}</span>
      </span>
      {children}
    </div>
  );
}
