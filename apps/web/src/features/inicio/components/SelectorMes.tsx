import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIdioma, useT } from '@/shared/i18n';
import { formatearMes } from '@/shared/lib/fechas';
import { Button, Select } from '@/shared/ui';
import { capitalizar } from '../lib/calculos';

interface Props {
  mes: string;
  /** Meses elegibles, del más reciente al más antiguo. */
  meses: readonly string[];
  mesActual: string;
  anterior: string | null;
  siguiente: string | null;
  onElegir: (mes: string) => void;
}

/**
 * ‹ mes › de Inicio. El desplegable es el mismo de Estadísticas («Octubre de 2026 · hasta hoy»);
 * las flechas se desactivan en los límites (primera cuenta y mes en curso: no hay futuro).
 */
export function SelectorMes({ mes, meses, mesActual, anterior, siguiente, onElegir }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const etiqueta = (m: string) => {
    const nombre = capitalizar(formatearMes(m, locale), locale);
    return m === mesActual ? t('selector.enCurso', { mes: nombre }) : nombre;
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variante="secundario"
        aria-label={t('selector.anterior')}
        icono={<ChevronLeft aria-hidden="true" className="size-4" />}
        disabled={anterior === null}
        onClick={() => anterior !== null && onElegir(anterior)}
        className="w-11 px-0"
      />
      <Select
        label={t('selector.etiqueta')}
        etiquetaOculta
        value={mes}
        onChange={(e) => onElegir(e.target.value)}
        className="min-w-56"
      >
        {meses.map((m) => (
          <option key={m} value={m}>
            {etiqueta(m)}
          </option>
        ))}
      </Select>
      <Button
        variante="secundario"
        aria-label={t('selector.siguiente')}
        icono={<ChevronRight aria-hidden="true" className="size-4" />}
        disabled={siguiente === null}
        onClick={() => siguiente !== null && onElegir(siguiente)}
        className="w-11 px-0"
      />
    </div>
  );
}
