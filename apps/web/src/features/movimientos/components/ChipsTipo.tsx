import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import type { TotalTipo } from '../api/sqlApi';
import { eurosRedondos, signoTotalTipo } from '../lib/presentacion';
import { TIPOS, type TipoMovimiento } from '../lib/tipos';

interface Props {
  valor: TipoMovimiento | null;
  onChange: (tipo: TipoMovimiento | null) => void;
  /** Número y total de cada tipo con los demás filtros (de SQL). undefined mientras carga. */
  totales?: readonly TotalTipo[] | undefined;
}

/**
 * Chips «Todos · 120», «Gastos · 38 · −863 €»… Botones con aria-pressed (filtro de selección
 * única). Los números vienen de `totales_por_tipo`; «Todos» solo lleva el número (sumar tipos
 * distintos no tiene sentido: los traspasos y ajustes no cuentan en el balance).
 * En móvil se deslizan en horizontal con un degradado en el borde derecho.
 */
export function ChipsTipo({ valor, onChange, totales }: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const porTipo = new Map(totales?.map((x) => [x.tipo, x]));
  const nTodos = totales?.reduce((s, x) => s + x.n, 0);

  const opciones: { valor: TipoMovimiento | null; etiqueta: string; detalle: string | null }[] = [
    { valor: null, etiqueta: t('chips.todos'), detalle: nTodos === undefined ? null : String(nTodos) },
    ...TIPOS.map((tipo) => {
      const x = porTipo.get(tipo);
      let detalle: string | null = null;
      if (totales !== undefined) {
        detalle = x === undefined ? '0' : `${x.n} · ${eurosRedondos(x.total, locale, signoTotalTipo(tipo))}`;
      }
      return { valor: tipo, etiqueta: t(`chips.${tipo}`), detalle };
    }),
  ];

  return (
    <div className="relative min-w-0 lg:flex-[1_1_auto]">
      <div
        role="group"
        aria-label={t('chips.etiqueta')}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pr-8 pb-0.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:pr-1"
      >
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
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                activo
                  ? 'bg-acento font-semibold text-sobre-acento'
                  : 'border border-borde-input text-texto hover:bg-superficie-2',
              )}
            >
              {o.etiqueta}
              {o.detalle !== null && (
                <span className={cx('tabular-nums', !activo && 'text-apagado')}>{` · ${o.detalle}`}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Degradado: indica que hay más chips a la derecha (solo móvil, donde se deslizan). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-superficie to-transparent lg:hidden"
      />
    </div>
  );
}
