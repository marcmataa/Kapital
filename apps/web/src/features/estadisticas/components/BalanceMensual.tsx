import { Card, EmptyState } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import { inicioDeMes } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { maximoAbsoluto, mediaMensual, proporcion } from '../lib/agregaciones';
import { etiquetaMes, mesCorto, signo } from '../lib/formato';

interface Props {
  meses: readonly ResumenMes[];
  hoy: string;
  inicioDatos: string | null;
}

/**
 * Balance de los últimos meses. Negativo en rojo con signo menos; el mes en curso se marca como
 * provisional («hasta hoy»). Media mensual solo con meses completos (sección 8).
 */
export function BalanceMensual({ meses, hoy, inicioDatos }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const mesActual = inicioDeMes(hoy);
  const maximo = maximoAbsoluto(meses.map((m) => m.balance));
  const media = mediaMensual(meses, hoy, inicioDatos);

  return (
    <Card titulo={t('balance.titulo')}>
      {meses.length === 0 ? (
        <EmptyState titulo={t('balance.vacio')} className="py-6" />
      ) : (
        <>
          <div aria-hidden="true" className="flex h-52 items-end gap-3 border-b border-borde-fuerte px-1.5">
            {meses.map((m) => {
              const enCurso = m.mes === mesActual;
              const negativo = signo(m.balance) < 0;
              return (
                <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span className={cx('cifras text-[11px]', negativo ? 'text-negativo' : 'text-apagado')}>
                    {enCurso ? t('balance.hastaHoy') : formatearEuros(m.balance, locale)}
                  </span>
                  <div
                    title={`${etiquetaMes(m.mes, locale)} · ${formatearEuros(m.balance, locale)}`}
                    className={cx(
                      'w-full rounded-t-md',
                      enCurso
                        ? cx('border-2 border-dashed bg-transparent', negativo ? 'border-negativo' : 'border-acento')
                        : negativo
                          ? 'bg-negativo'
                          : 'bg-acento',
                    )}
                    style={{ height: `${Math.max(proporcion(m.balance, maximo) * 0.85, 1)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div aria-hidden="true" className="mt-1.5 flex gap-3 px-1.5 text-xs text-apagado">
            {meses.map((m) => (
              <span key={m.mes} className="flex-1 text-center capitalize">
                {mesCorto(m.mes, locale)}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>{t('balance.tabla')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('tabla.mes')}</th>
                <th scope="col">{t('tabla.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <th scope="row">{etiquetaMes(m.mes, locale)}</th>
                  <td>
                    {formatearEuros(m.balance, locale)}
                    {m.mes === mesActual && ` (${t('balance.hastaHoy')})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-3 text-xs text-apagado sm:text-sm">
        {t('balance.media', { media: media === null ? '—' : formatearEuros(media, locale) })}
        {meses.some((m) => m.mes === mesActual) && ` ${t('balance.provisional')}`}
      </p>
    </Card>
  );
}
