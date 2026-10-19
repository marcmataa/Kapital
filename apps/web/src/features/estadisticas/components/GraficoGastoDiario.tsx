import { Card } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { aCentimos, desdeCentimos, formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import { maximoAbsoluto, proporcion, type GastoDia } from '../lib/agregaciones';

interface Props {
  dias: readonly GastoDia[];
}

const MARCAS_EJE = [1, 5, 10, 15, 20, 25];

/**
 * Gasto neto por día. Los días futuros quedan vacíos; el de hoy se dibuja hueco (provisional).
 * Alternativa accesible: tabla oculta visualmente con todos los días.
 */
export function GraficoGastoDiario({ dias }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const maximo = maximoAbsoluto(dias.map((d) => d.gasto));
  const ultimo = dias.length;
  const etiquetaDia = (d: GastoDia) => formatearFecha(d.fecha, locale, 'media');
  const titulo = (d: GastoDia) =>
    d.gasto === null
      ? t('diario.futuro', { fecha: etiquetaDia(d) })
      : `${etiquetaDia(d)} · ${formatearEuros(d.gasto, locale)}${d.hoy ? ` · ${t('diario.hoy')}` : ''}`;
  // Escala del eje: máximo, mitad y 0 (céntimos → texto, sin float).
  const mitad = desdeCentimos(maximo / 2n);

  return (
    <Card titulo={t('diario.titulo')}>
      <div className="flex gap-2" aria-hidden="true">
        <div className="flex h-48 min-w-12 flex-col justify-between text-right text-[11px] text-apagado">
          <span className="cifras">{formatearEuros(desdeCentimos(maximo), locale)}</span>
          <span className="cifras">{formatearEuros(mitad, locale)}</span>
          <span className="cifras">{formatearEuros('0', locale)}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex h-48 items-end gap-[2px] border-b border-borde-fuerte">
            {dias.map((d) => {
              const negativo = d.gasto !== null && aCentimos(d.gasto) < 0n;
              const alto = d.gasto === null || negativo ? 0 : proporcion(d.gasto, maximo);
              return (
                <div
                  key={d.dia}
                  title={titulo(d)}
                  className={cx(
                    'min-w-0 flex-1 rounded-t-[3px]',
                    d.gasto === null && 'h-0',
                    d.hoy ? 'border-2 border-dashed border-acento bg-transparent' : 'bg-acento',
                    negativo && 'h-0.5 bg-negativo',
                  )}
                  style={d.gasto === null || negativo ? undefined : { height: `${Math.max(alto, 1)}%` }}
                />
              );
            })}
          </div>
          <div className="relative h-4 text-[11px] text-apagado">
            {[...MARCAS_EJE, ultimo].map((dia) => (
              <span
                key={dia}
                className="absolute -translate-x-1/2"
                style={{ left: `${((dia - 0.5) / ultimo) * 100}%` }}
              >
                {dia}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-apagado sm:text-sm">{t('diario.nota')}</p>
      <table className="sr-only">
        <caption>{t('diario.tabla')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('tabla.dia')}</th>
            <th scope="col">{t('tabla.gastoNeto')}</th>
          </tr>
        </thead>
        <tbody>
          {dias
            .filter((d) => d.gasto !== null)
            .map((d) => (
              <tr key={d.dia}>
                <th scope="row">{etiquetaDia(d)}</th>
                <td>
                  {formatearEuros(d.gasto ?? '0', locale)}
                  {d.hoy && ` (${t('diario.hoy')})`}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}
