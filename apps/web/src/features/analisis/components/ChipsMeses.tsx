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

/** Chips de meses (como en el diseño): el mes en curso no es enlace, se genera el día 1 del siguiente. */
export function ChipsMeses({ entradas, seleccionado }: Props) {
  const t = useT('analisis');
  const locale = useLocale();
  return (
    <nav aria-label={t('lista.meses')}>
      <ul className="flex flex-wrap gap-2">
        {entradas.map((e) => {
          if (e.tipo === 'en_curso') {
            return (
              <li
                key={e.mes}
                className="rounded-full border border-dashed border-borde-fuerte px-3.5 py-2 text-sm text-apagado"
              >
                {t('lista.enCurso', { mes: etiquetaMes(e.mes, locale), fecha: diaMes(sumarMeses(e.mes, 1), locale) })}
              </li>
            );
          }
          const activo = e.mes === seleccionado;
          return (
            <li key={e.mes}>
              <Link
                to={rutaDeMes(e.mes)}
                aria-current={activo ? 'page' : undefined}
                className={cx(
                  'block rounded-full px-3.5 py-2 text-sm transition-colors',
                  activo
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
    </nav>
  );
}
