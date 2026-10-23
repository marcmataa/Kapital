import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cx } from '@/shared/lib/cx';

export type TonoStat = 'acento' | 'positivo' | 'negativo' | 'morado' | 'neutro';
export type Tendencia = 'sube' | 'baja' | 'igual';

export interface VariacionStat {
  /** Texto ya formateado ('+18,6 %'). */
  texto: string;
  tendencia: Tendencia;
  /** ¿Subir es bueno? (ingresos sí, gastos no). Decide el color. Por defecto true. */
  subirEsBueno?: boolean;
  /** Contexto: «vs. mes anterior». */
  contexto?: string;
}

interface Props {
  titulo: string;
  /** Valor ya formateado ('2.458,32 €'). */
  valor: string;
  icono?: ReactNode;
  tono?: TonoStat;
  variacion?: VariacionStat;
  /** Texto cuando no hay variación (p. ej. «Sin datos del mes anterior»). */
  pie?: ReactNode;
  /** Cifra protagonista: más grande en móvil (p. ej. el patrimonio de Inicio). */
  destacado?: boolean;
  /** Contenido bajo la cifra (p. ej. el desglose por cuenta). */
  children?: ReactNode;
  className?: string;
}

const FONDO_ICONO: Record<TonoStat, string> = {
  acento: 'bg-acento-suave text-acento',
  positivo: 'bg-positivo-suave text-positivo',
  negativo: 'bg-negativo-suave text-negativo',
  morado: 'bg-morado-suave text-morado',
  neutro: 'bg-superficie-2 text-apagado',
};

function colorVariacion({ tendencia, subirEsBueno = true }: VariacionStat): string {
  if (tendencia === 'igual') return 'text-apagado';
  return (tendencia === 'sube') === subirEsBueno ? 'text-positivo' : 'text-negativo';
}

const FLECHA = { sube: ArrowUp, baja: ArrowDown, igual: Minus } as const;

/** Tarjeta KPI (Saldo actual, Ingresos, Gastos…) como en el diseño. */
export function StatCard({
  titulo,
  valor,
  icono,
  tono = 'acento',
  variacion,
  pie,
  destacado = false,
  children,
  className,
}: Props) {
  const Flecha = FLECHA[variacion?.tendencia ?? 'igual'];
  return (
    <article
      className={cx('flex gap-4 rounded-2xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5', className)}
    >
      {icono !== undefined && (
        <div
          className={cx('flex size-11 shrink-0 items-center justify-center rounded-full', FONDO_ICONO[tono])}
          aria-hidden="true"
        >
          {icono}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm text-apagado">{titulo}</h3>
        <p
          className={cx(
            'cifras mt-1 truncate font-semibold tracking-tight text-texto sm:text-3xl',
            destacado ? 'text-4xl' : 'text-2xl',
          )}
        >
          {valor}
        </p>
        {variacion ? (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
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
      </div>
    </article>
  );
}
