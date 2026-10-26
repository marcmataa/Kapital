import { AyudaGrafico, Card, EmptyState, EtiquetasEje, LecturaGrafico, LineasEje } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { escalaDeImportes, formatearEurosEje, tramoBarra } from '@/shared/lib/ejes';
import { inicioDeMes } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { etiquetaMes, mesCorto, mesDesde } from '../lib/formato';

interface Props {
  /** Meses a dibujar (resumen_mensual), en orden cronológico. */
  meses: readonly ResumenMes[];
  hoy: string;
}

/** Ancho fijo de la columna de etiquetas del eje: la fila de meses queda alineada con las barras. */
const ANCHO_ETIQUETAS = 'w-14 min-w-14';

/** '99000' céntimos → '+990 €'; '-50000' → '-500 €'. Sin decimales: es la etiqueta de la barra. */
function etiquetaBarra(balance: string, locale: string): string {
  const c = aCentimos(balance);
  return `${c > 0n ? '+' : ''}${formatearEurosEje(c, locale)}`;
}

/**
 * Lo que te quedó cada mes, como en la app de un banco: una barra por mes desde el cero, verde
 * hacia arriba si ahorraste y roja hacia abajo si gastaste más de lo que entró, con la cifra en la
 * barra. Al elegir un mes se leen sus ingresos, gastos netos y ahorro. Todo calculado en SQL
 * (resumen_mensual, sección 3); aquí solo se dibuja. El mes en curso es provisional (rayado).
 * Ahorro «—» si no hay ingresos. Se recorre mes a mes con ratón, dedo o teclado.
 */
export function GraficoBalanceMeses({ meses, hoy }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  // Con menos de 6 meses de datos, el título dice desde cuándo: «Últimos 6 meses» con 2 barras engaña.
  const primero = meses[0];
  const tituloTarjeta =
    primero !== undefined && meses.length < 6 ? t('meses.tituloDesde', { mes: mesDesde(primero.mes, locale) }) : t('balanceMeses.titulo');
  const mesActual = inicioDeMes(hoy);
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: meses.length, inicial: meses.length - 1 });
  const elegido = meses[indice];

  // Con el cero siempre dentro: los meses en negativo quedan por debajo.
  const escala = escalaDeImportes(meses.map((m) => m.balance));
  const n = meses.length;

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
    <Card titulo={tituloTarjeta} accion={<AyudaGrafico unidad="mes" />}>
      {!elegido || !sel ? (
        <EmptyState titulo={t('balance.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-apagado sm:text-sm" aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-positivo" />
              {t('balanceMeses.leyenda.ahorro')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-negativo" />
              {t('balanceMeses.leyenda.deficit')}
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
            {/* Margen arriba y abajo: las cifras de la barra más alta y de la más baja caben. */}
            <div className="flex gap-2 py-6">
              <EtiquetasEje escala={escala} locale={locale} className={cx('h-56', ANCHO_ETIQUETAS)} />
              <div
                aria-hidden="true"
                data-testid="superficie-balance"
                className="relative flex h-56 min-w-0 flex-1 cursor-crosshair touch-pan-y select-none"
                {...superficie}
              >
                <LineasEje escala={escala} />
                {meses.map((m, i) => {
                  const provisional = m.mes === mesActual;
                  const esElegido = i === indice;
                  const negativo = aCentimos(m.balance) < 0n;
                  const color = negativo ? 'negativo' : 'positivo';
                  const { abajo, alto } = tramoBarra(m.balance, escala);
                  return (
                    <div
                      key={m.mes}
                      className={cx('relative flex h-full min-w-0 flex-1 justify-center rounded-md px-2', esElegido && 'bg-superficie-2')}
                    >
                      <div className="relative h-full w-full max-w-10">
                        <span
                          data-provisional={provisional ? 'true' : undefined}
                          data-balance={m.balance}
                          className={cx(
                            'absolute inset-x-0',
                            negativo ? 'rounded-b-md' : 'rounded-t-md',
                            provisional ? cx('relleno-provisional', TEXTO[color]) : FONDO[color],
                            !esElegido && !provisional && 'opacity-80',
                          )}
                          style={{ bottom: `${abajo}%`, height: `${alto}%` }}
                        />
                        {/* La cifra, encima de la barra si es positiva y debajo si es negativa. */}
                        <span
                          className={cx(
                            'cifras absolute inset-x-0 -mx-2 text-center text-[11px] font-semibold whitespace-nowrap sm:text-xs',
                            negativo ? 'text-negativo' : 'text-positivo',
                            // Con `bottom`, la etiqueta queda encima del punto; la negativa se baja su alto.
                            negativo ? 'translate-y-full pt-1' : 'pb-1',
                          )}
                          style={negativo ? { bottom: `${abajo}%` } : { bottom: `${abajo + alto}%` }}
                        >
                          {etiquetaBarra(m.balance, locale)}
                        </span>
                      </div>
                    </div>
                  );
                })}
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
            <caption>{tituloTarjeta}</caption>
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
