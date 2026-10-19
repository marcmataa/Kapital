import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { TIPOS, type TipoMovimiento } from '../lib/tipos';

interface Props {
  valor: TipoMovimiento | null;
  onChange: (tipo: TipoMovimiento | null) => void;
}

/** Chips «Todos · Gastos · Ingresos · …». Botones con aria-pressed (filtro de selección única). */
export function ChipsTipo({ valor, onChange }: Props) {
  const t = useT('movimientos');
  const opciones: { valor: TipoMovimiento | null; etiqueta: string }[] = [
    { valor: null, etiqueta: t('chips.todos') },
    ...TIPOS.map((tipo) => ({ valor: tipo, etiqueta: t(`chips.${tipo}`) })),
  ];
  return (
    <div role="group" aria-label={t('chips.etiqueta')} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor ?? 'todos'}
            type="button"
            aria-pressed={activo}
            onClick={() => onChange(o.valor)}
            className={cx(
              'shrink-0 rounded-full px-3.5 py-2 text-[13px] whitespace-nowrap transition-colors',
              activo
                ? 'bg-acento font-semibold text-sobre-acento'
                : 'border border-borde-input text-texto hover:bg-superficie-2',
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
