import { AyudaGrafico, Card, EmptyState, EtiquetasEje, LecturaGrafico, LineasEje } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { escalaDeImportes, posicionEnEje, tramoBarra } from '@/shared/lib/ejes';
import { inicioDeMes } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { etiquetaMes, mesCorto } from '../lib/formato';

interface Props {
  /** Meses a dibujar (resumen_mensual), en orden cronológico. */
  meses: readonly ResumenMes[];
  hoy: string;
}

/** Ancho fijo de la columna de etiquetas: las dos franjas (barras y balance) quedan alineadas. */
const ANCHO_ETIQUETAS = 'w-16 min-w-16';

/**
 * Últimos meses: ingresos y gastos netos en barras, una al lado de otra, y debajo el balance de
 * cada mes en su propia franja con su propio eje (así un mes a medias no parece «caer a cero» en
 * la escala de los ingresos). Todo calculado en SQL (resumen_mensual, sección 3); aquí solo se
 * dibuja. El mes en curso es provisional: barras con relleno rayado y su balance escrito junto al
 * punto. Ahorro «—» si no hay ingresos. Se recorre mes a mes con ratón, dedo o teclado.
 */
export function GraficoBalanceMeses({ meses, hoy }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const mesActual = inicioDeMes(hoy);
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: meses.length, inicial: meses.length - 1 });
  const elegido = meses[indice];

  const escalaBarras = escalaDeImportes(meses.flatMap((m) => [m.ingresos, m.gastos_netos]));
  const escalaBalance = escalaDeImportes(
    meses.map((m) => m.balance),
    { marcas: 3 },
  );
  const n = meses.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: string) => (1 - posicionEnEje(v, escalaBalance)) * 100;

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
  const indiceEnCurso = meses.findIndex((m) => m.mes === mesActual);
  const enCurso = meses[indiceEnCurso];

  return (
    <Card titulo={t('balanceMeses.titulo')} accion={<AyudaGrafico unidad="mes" />}>
      {!elegido || !sel ? (
        <EmptyState titulo={t('balance.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-apagado sm:text-sm" aria-hidden="true">
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
            className="flex flex-col gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            {/* Franja 1: ingresos y gastos netos. */}
            <div className="flex gap-2">
              <EtiquetasEje escala={escalaBarras} locale={locale} className={cx('h-44', ANCHO_ETIQUETAS)} />
              <div
                aria-hidden="true"
                data-testid="superficie-balance"
                className="relative flex h-44 min-w-0 flex-1 cursor-crosshair touch-pan-y select-none"
                {...superficie}
              >
                <LineasEje escala={escalaBarras} />
                {meses.map((m, i) => {
                  const provisional = m.mes === mesActual;
                  const esElegido = i === indice;
                  const barra = (valor: string, color: 'positivo' | 'negativo') => {
                    const { abajo, alto } = tramoBarra(valor, escalaBarras);
                    return (
                      <span className="relative h-full min-w-0 flex-1">
                        <span
                          data-provisional={provisional ? 'true' : undefined}
                          className={cx(
                            'absolute inset-x-0 rounded-sm',
                            provisional ? cx('relleno-provisional', TEXTO[color]) : FONDO[color],
                            !esElegido && !provisional && 'opacity-70',
                          )}
                          style={{ bottom: `${abajo}%`, height: `${alto}%` }}
                        />
                      </span>
                    );
                  };
                  return (
                    <div
                      key={m.mes}
                      className={cx('relative flex h-full min-w-0 flex-1 justify-center rounded-md px-1.5', esElegido && 'bg-superficie-2')}
                    >
                      <div className="flex h-full w-full max-w-20 gap-1">
                        {barra(m.ingresos, 'positivo')}
                        {barra(m.gastos_netos, 'negativo')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Franja 2: balance, con su propio eje y su línea del cero. */}
            <div className="flex gap-2">
              <EtiquetasEje escala={escalaBalance} locale={locale} className={cx('h-20', ANCHO_ETIQUETAS)} />
              <div
                aria-hidden="true"
                data-testid="franja-balance"
                className="relative h-20 min-w-0 flex-1 cursor-crosshair touch-pan-y select-none"
                {...superficie}
              >
                <LineasEje escala={escalaBalance} />
                {meses.map((m, i) => (
                  <span
                    key={m.mes}
                    className={cx('absolute inset-y-0 rounded-md', i === indice && 'bg-superficie-2/60')}
                    style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
                  />
                ))}
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
                      i === indice ? 'bg-morado' : m.mes === mesActual ? 'relleno-provisional text-morado' : 'bg-superficie',
                    )}
                    style={{ left: `${x(i)}%`, bottom: `${100 - y(m.balance)}%` }}
                  />
                ))}
                {enCurso && (
                  <span
                    data-testid="valor-mes-en-curso"
                    className={cx(
                      'cifras pointer-events-none absolute text-xs font-semibold whitespace-nowrap text-texto',
                      indiceEnCurso > n / 2 ? '-translate-x-full pr-2.5' : 'pl-2.5',
                      posicionEnEje(enCurso.balance, escalaBalance) > 0.5 && 'translate-y-full',
                    )}
                    style={{
                      left: `${x(indiceEnCurso)}%`,
                      bottom: `${100 - y(enCurso.balance)}%`,
                    }}
                  >
                    {formatearEuros(enCurso.balance, locale, { signo: 'siempre' })}
                  </span>
                )}
              </div>
            </div>

            <div aria-hidden="true" className="flex gap-2 text-xs text-apagado">
              <span className={ANCHO_ETIQUETAS} />
              <div className="flex min-w-0 flex-1">
                {meses.map((m, i) => (
                  <span key={m.mes} className={cx('flex-1 text-center capitalize', i === indice && 'font-semibold text-texto')}>
                    {mesCorto(m.mes, locale)}
                  </span>
                ))}
              </div>
            </div>
          </div>
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
/** Color del rayado provisional (`relleno-provisional` usa currentColor). */
const TEXTO = { positivo: 'text-positivo', negativo: 'text-negativo' } as const;
