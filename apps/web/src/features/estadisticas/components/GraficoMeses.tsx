import { AyudaGrafico, Card, EmptyState, EtiquetasEje, LecturaGrafico, LineasEje } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { escalaDeImportes, tramoBarra } from '@/shared/lib/ejes';
import { inicioDeMes } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { etiquetaMes, mesCorto, mesDesde } from '../lib/formato';

interface Props {
  /** Meses a dibujar (resumen_mensual), en orden cronológico. */
  meses: readonly ResumenMes[];
  hoy: string;
}

/**
 * Gastos netos de los últimos meses (resumen_mensual, sección 3). El mes en curso es provisional
 * («hasta hoy», relleno rayado). Eje con números redondos; un mes en negativo (más devoluciones que
 * gastos) baja del cero. Con pocos meses las barras no se ensanchan (ancho máximo).
 * Se recorre mes a mes con ratón, dedo (`touch-action: pan-y`) o teclado.
 */
export function GraficoMeses({ meses, hoy }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  // Con menos de 6 meses de datos, el título dice desde cuándo: «Últimos 6 meses» con 2 barras engaña.
  const primero = meses[0];
  const tituloTarjeta =
    primero !== undefined && meses.length < 6 ? t('meses.tituloDesde', { mes: mesDesde(primero.mes, locale) }) : t('meses.titulo');
  const mesActual = inicioDeMes(hoy);
  const escala = escalaDeImportes(meses.map((m) => m.gastos_netos));
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: meses.length, inicial: meses.length - 1 });
  const elegido = meses[indice];
  const titulo = (m: ResumenMes) =>
    m.mes === mesActual ? t('meses.lectura.enCurso', { mes: etiquetaMes(m.mes, locale) }) : etiquetaMes(m.mes, locale);

  return (
    <Card titulo={tituloTarjeta} accion={<AyudaGrafico unidad="mes" />}>
      {!elegido ? (
        <EmptyState titulo={t('balance.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          <LecturaGrafico
            data-testid="lectura-meses"
            titulo={titulo(elegido)}
            valor={formatearEuros(elegido.gastos_netos, locale)}
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label={t('meses.control')}
            aria-valuemin={1}
            aria-valuemax={meses.length}
            aria-valuenow={indice + 1}
            aria-valuetext={`${titulo(elegido)} · ${formatearEuros(elegido.gastos_netos, locale)}`}
            onKeyDown={alTeclado}
            className="flex gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            <EtiquetasEje escala={escala} locale={locale} className="mt-5 h-44" />
            <div aria-hidden="true" className="min-w-0 flex-1">
              <div
                data-testid="superficie-meses"
                className="relative mt-5 flex h-44 cursor-crosshair touch-pan-y gap-3 px-1.5 select-none"
                {...superficie}
              >
                <LineasEje escala={escala} />
                {meses.map((m, i) => {
                  const enCurso = m.mes === mesActual;
                  const esElegido = i === indice;
                  const negativo = aCentimos(m.gastos_netos) < 0n;
                  const { abajo, alto } = tramoBarra(m.gastos_netos, escala);
                  return (
                    <div
                      key={m.mes}
                      className={cx('relative flex h-full min-w-0 flex-1 justify-center rounded-md', esElegido && 'bg-superficie-2')}
                    >
                      <div className="relative h-full w-full max-w-10">
                        <span
                          data-provisional={enCurso ? 'true' : undefined}
                          className={cx(
                            'absolute inset-x-0',
                            negativo ? 'rounded-b-md' : 'rounded-t-md',
                            enCurso
                              ? cx('relleno-provisional', negativo ? 'text-negativo' : 'text-acento')
                              : negativo
                                ? 'bg-negativo'
                                : 'bg-acento',
                            !esElegido && !enCurso && 'opacity-70',
                          )}
                          style={{ bottom: `${abajo}%`, height: `${alto}%` }}
                        />
                        <span
                          className="cifras absolute inset-x-[-0.75rem] text-center text-xs whitespace-nowrap text-apagado"
                          style={negativo ? { bottom: `${abajo}%`, transform: 'translateY(100%)' } : { bottom: `calc(${abajo + alto}% + 2px)` }}
                        >
                          {formatearEuros(m.gastos_netos, locale)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex gap-3 px-1.5 text-xs text-apagado">
                {meses.map((m, i) => (
                  <span key={m.mes} className={cx('flex-1 text-center capitalize', i === indice && 'font-semibold text-texto')}>
                    {mesCorto(m.mes, locale)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[13px] text-apagado sm:text-sm">{t('meses.ayuda')}</p>
          <table className="sr-only">
            <caption>{tituloTarjeta}</caption>
            <thead>
              <tr>
                <th scope="col">{t('tabla.mes')}</th>
                <th scope="col">{t('tabla.gastoNeto')}</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <th scope="row">{titulo(m)}</th>
                  <td>{formatearEuros(m.gastos_netos, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
