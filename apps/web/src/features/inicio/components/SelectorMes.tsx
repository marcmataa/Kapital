import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIdioma, useT } from '@/shared/i18n';
import { formatearMes } from '@/shared/lib/fechas';
import { Button } from '@/shared/ui';
import { capitalizar } from '../lib/calculos';

interface Props {
  mes: string;
  anterior: string | null;
  siguiente: string | null;
  onElegir: (mes: string) => void;
}

/**
 * ‹ Octubre de 2026 › de Inicio: solo flechas; el mes es texto (sin desplegable) y se anuncia al
 * cambiar (aria-live). Las flechas se desactivan en los límites (primera cuenta y mes en curso:
 * no hay futuro).
 */
export function SelectorMes({ mes, anterior, siguiente, onElegir }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();

  return (
    // Una sola pastilla compacta (‹ mes ›): cabe en la cabecera sin ocupar una fila de tarjeta.
    <div
      role="group"
      aria-label={t('selector.etiqueta')}
      className="inline-flex items-center gap-0.5 rounded-2xl border border-borde bg-superficie p-0.5"
    >
      <Button
        variante="fantasma"
        aria-label={t('selector.anterior')}
        icono={<ChevronLeft aria-hidden="true" className="size-4" />}
        disabled={anterior === null}
        onClick={() => anterior !== null && onElegir(anterior)}
        className="w-11 px-0"
      />
      <span
        aria-live="polite"
        aria-atomic="true"
        data-testid="mes-seleccionado"
        className="min-w-34 text-center text-sm font-semibold text-texto"
      >
        {capitalizar(formatearMes(mes, locale), locale)}
      </span>
      <Button
        variante="fantasma"
        aria-label={t('selector.siguiente')}
        icono={<ChevronRight aria-hidden="true" className="size-4" />}
        disabled={siguiente === null}
        onClick={() => siguiente !== null && onElegir(siguiente)}
        className="w-11 px-0"
      />
    </div>
  );
}
