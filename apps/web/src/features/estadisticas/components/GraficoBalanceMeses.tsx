import { Card, EmptyState, LecturaGrafico } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { inicioDeMes } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { fraccionEntre } from '../lib/agregaciones';
import { etiquetaMes, mesCorto } from '../lib/formato';

interface Props {
  /** Meses a dibujar (resumen_mensual), en orden cronológico. */
  meses: readonly ResumenMes[];
  hoy: string;
}

/** Tramo vertical [abajo, abajo + alto] (en %) de una barra que sale del cero. */
function tramo(valor: string, min: bigint, max: bigint) {
  const cero = fraccionEntre('0', min, max);
  const v = fraccionEntre(valor, min, max);
  return { abajo: Math.min(cero, v) * 100, alto: Math.max(Math.abs(v - cero) * 100, 0.5) };
}

/**
 * Últimos meses: ingresos y gastos netos en barras, una al lado de otra, y el balance de cada mes
 * en línea (resumen_mensual, sección 3; todo calculado en SQL). Ahorro «—» si no hay ingresos.
 * Se recorre mes a mes con ratón, dedo (`touch-action: pan-y`) o teclado.
 */
export function GraficoBalanceMeses({ meses, hoy }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const mesActual = inicioDeMes(hoy);
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: meses.length, inicial: meses.length - 1 });
  const elegido = meses[indice];

  const centimos = meses.flatMap((m) => [m.ingresos, m.gastos_netos, m.balance].map(aCentimos));
  const min = centimos.reduce((a, b) => (b < a ? b : a), 0n);
  const max = centimos.reduce((a, b) => (b > a ? b : a), 0n);
  const n = meses.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: string) => (1 - fraccionEntre(v, min, max)) * 100;
  const ceroY = y('0');

  const lectura = (m: ResumenMes) => {
    const titulo = m.mes === mesActual ? t('meses.lectura.enCurso', { mes: etiquetaMes(m.mes, locale) }) : etiquetaMes(m.mes, locale);
    const valor = formatearEuros(m.balance, locale, { signo: 'siempre' });
    const detalle = [
      t('balanceMeses.ingresos', { importe: formatearEuros(m.ingresos, locale) }),
      t('balanceMeses.gastos', { importe: formatearEuros(m.gastos_netos, locale) }),
      t('balanceMeses.ahorro', { porcentaje: formatearPorcentaje(m.ahorro_pct, locale) }),
    ];
    return { titulo, valor, detalle };
  };
  const sel = elegido ? lectura(elegido) : null;

  return (
    <Card
      titulo={t('balanceMeses.titulo')}
      accion={
        <span className="flex flex-wrap gap-3 text-xs text-apagado sm:text-sm" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-positivo" />
            {t('balanceMeses.leyenda.ingresos')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-negativo" />
            {t('balanceMeses.leyenda.gastos')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-sm bg-morado" />
            {t('balanceMeses.leyenda.balance')}
          </span>
        </span>
      }
    >
      {!elegido || !sel ? (
        <EmptyState titulo={t('balance.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          <LecturaGrafico data-testid="lectura-balance" titulo={`${sel.titulo} · ${t('balanceMeses.balance')}`} valor={sel.valor}>
            <span className="cifras text-xs text-apagado sm:text-sm">{sel.detalle.join(' · ')}</span>
          </LecturaGrafico>
          <div
            role="slider"
            tabIndex={0}
            aria-label={t('balanceMeses.control')}
            aria-valuemin={1}
            aria-valuemax={n}
            aria-valuenow={indice + 1}
            aria-valuetext={[`${sel.titulo} · ${t('balanceMeses.balance')} ${sel.valor}`, ...sel.detalle].join('. ')}
            onKeyDown={alTeclado}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            <div
              aria-hidden="true"
              data-testid="superficie-balance"
              className="relative flex h-52 cursor-crosshair touch-pan-y select-none"
              {...superficie}
            >
              <span className="absolute inset-x-0 border-t border-borde-fuerte" style={{ top: `${ceroY}%` }} />
              {meses.map((m, i) => {
                const enCurso = m.mes === mesActual;
                const esElegido = i === indice;
                const barra = (valor: string, color: 'positivo' | 'negativo') => {
                  const { abajo, alto } = tramo(valor, min, max);
                  return (
                    <span className="relative h-full min-w-0 flex-1">
                      <span
                        className={cx(
                          'absolute inset-x-0 rounded-sm',
                          enCurso ? cx('border-2 border-dashed bg-transparent', BORDE[color]) : FONDO[color],
                          !esElegido && !enCurso && 'opacity-70',
                        )}
                        style={{ bottom: `${abajo}%`, height: `${alto}%` }}
                      />
                    </span>
                  );
                };
                return (
                  <div key={m.mes} className={cx('flex h-full min-w-0 flex-1 gap-1 rounded-md px-1.5', esElegido && 'bg-superficie-2')}>
                    {barra(m.ingresos, 'positivo')}
                    {barra(m.gastos_netos, 'negativo')}
                  </div>
                );
              })}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              >
                <polyline
                  data-testid="linea-balance"
                  points={meses.map((m, i) => `${x(i).toFixed(2)},${y(m.balance).toFixed(2)}`).join(' ')}
                  fill="none"
                  className="stroke-morado"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {meses.map((m, i) => (
                <span
                  key={m.mes}
                  className={cx(
                    'pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-morado',
                    i === indice ? 'bg-morado' : 'bg-superficie',
                  )}
                  style={{ left: `${x(i)}%`, bottom: `${100 - y(m.balance)}%` }}
                />
              ))}
            </div>
            <div aria-hidden="true" className="mt-1.5 flex text-xs text-apagado">
              {meses.map((m, i) => (
                <span key={m.mes} className={cx('flex-1 text-center capitalize', i === indice && 'font-semibold text-texto')}>
                  {mesCorto(m.mes, locale)}
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-apagado sm:text-sm">{t('balanceMeses.ayuda')}</p>
          <table className="sr-only">
            <caption>{t('balanceMeses.titulo')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('tabla.mes')}</th>
                <th scope="col">{t('tabla.ingresos')}</th>
                <th scope="col">{t('tabla.gastoNeto')}</th>
                <th scope="col">{t('tabla.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <th scope="row">
                    {etiquetaMes(m.mes, locale)}
                    {m.mes === mesActual && ` (${t('balance.hastaHoy')})`}
                  </th>
                  <td>{formatearEuros(m.ingresos, locale)}</td>
                  <td>{formatearEuros(m.gastos_netos, locale)}</td>
                  <td>{formatearEuros(m.balance, locale, { signo: 'siempre' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const FONDO = { positivo: 'bg-positivo', negativo: 'bg-negativo' } as const;
const BORDE = { positivo: 'border-positivo', negativo: 'border-negativo' } as const;
