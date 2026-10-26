import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useT } from '@/shared/i18n';
import { sumarMeses } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import { useLocale } from '../hooks/useLocale';
import { diaMes, etiquetaMes } from '../lib/formato';
import { rutaDeMes, type EntradaMes } from '../lib/meses';

interface Props {
  entradas: readonly EntradaMes[];
  /** Mes abierto ('YYYY-MM-01'). */
  seleccionado?: string;
}

/**
 * Meses cerrados en una fila de chips, del más reciente al más antiguo. En el móvil la fila se
 * desliza en horizontal (sin saltos de línea) y el chip elegido se trae a la vista. El mes en
 * curso no es un chip: debajo se dice cuándo se genera.
 */
export function ChipsMeses({ entradas, seleccionado }: Props) {
  const t = useT('analisis');
  const locale = useLocale();
  const activo = useRef<HTMLAnchorElement>(null);
  const cerrados = entradas.filter((e) => e.tipo !== 'en_curso');
  const enCurso = entradas.find((e) => e.tipo === 'en_curso');

  useEffect(() => {
    // jsdom no implementa scrollIntoView.
    activo.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [seleccionado]);

  return (
    <nav aria-label={t('lista.meses')} className="flex flex-col gap-2">
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {cerrados.map((e) => {
          const esActivo = e.mes === seleccionado;
          return (
            <li key={e.mes} className="shrink-0 snap-start">
              <Link
                ref={esActivo ? activo : undefined}
                to={rutaDeMes(e.mes)}
                aria-current={esActivo ? 'page' : undefined}
                className={cx(
                  'block rounded-full px-3.5 py-2 text-sm whitespace-nowrap transition-colors',
                  esActivo
                    ? 'bg-acento font-semibold text-sobre-acento'
                    : 'border border-borde-fuerte text-texto hover:bg-superficie-2',
                )}
              >
                {etiquetaMes(e.mes, locale)}
              </Link>
            </li>
          );
        })}
      </ul>
      {enCurso && (
        <p className="text-xs text-apagado sm:text-sm">
          {t('lista.enCurso', { mes: etiquetaMes(enCurso.mes, locale), fecha: diaMes(sumarMeses(enCurso.mes, 1), locale) })}
        </p>
      )}
    </nav>
  );
}
