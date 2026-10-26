import { cx } from '@/shared/lib/cx';
import { formatearEurosEje, posicionEnEje, type EscalaEje } from '@/shared/lib/ejes';

/**
 * Piezas del eje vertical de los gráficos de barras HTML (Estadísticas), todas con la misma
 * escala redonda de `shared/lib/ejes`: etiquetas a la izquierda y líneas guía dentro del área.
 * Decorativas (`aria-hidden`): cada gráfico tiene su propia alternativa accesible.
 */

/** Columna de etiquetas («0 €», «100 €», «200 €»…) a la altura de cada marca. */
export function EtiquetasEje({ escala, locale, className }: { escala: EscalaEje; locale: string; className?: string }) {
  return (
    <div aria-hidden="true" className={cx('relative h-full min-w-11 shrink-0 text-right text-xs text-apagado', className)}>
      {escala.ticks.map((c) => (
        <span
          key={c.toString()}
          className="cifras absolute right-0 translate-y-1/2 leading-none whitespace-nowrap"
          style={{ bottom: `${posicionEnEje(c, escala) * 100}%` }}
        >
          {formatearEurosEje(c, locale)}
        </span>
      ))}
    </div>
  );
}

/** Líneas guía de cada marca; la del cero, más marcada (las barras negativas quedan debajo). */
export function LineasEje({ escala }: { escala: EscalaEje }) {
  return (
    <>
      {escala.ticks.map((c) => (
        <span
          key={c.toString()}
          aria-hidden="true"
          data-cero={c === 0n ? 'true' : undefined}
          className={cx('pointer-events-none absolute inset-x-0 border-t', c === 0n ? 'border-borde-fuerte' : 'border-borde/60')}
          style={{ bottom: `${posicionEnEje(c, escala) * 100}%` }}
        />
      ))}
    </>
  );
}
