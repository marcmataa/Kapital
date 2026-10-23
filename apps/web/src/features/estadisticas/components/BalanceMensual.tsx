import { Card, EmptyState, LecturaGrafico } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { formatearEuros, formatearPorcentaje, variacionPorcentual } from '@/shared/lib/dinero';
import { finDeMes, inicioDeMes, sumarMeses } from '@/shared/lib/fechas';
import { tramoConDatos } from '@/shared/lib/periodos';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { maximoAbsoluto, mediaMensual, proporcion } from '../lib/agregaciones';
import { etiquetaMes, formatearTramo, mesCorto, signo } from '../lib/formato';
import type { Rango } from '../lib/periodos';
import { LineaVariacion } from './LineaVariacion';

interface Props {
  /** Filas de resumen_mensual. Puede traer el mes anterior al primero visible, solo para comparar. */
  meses: readonly ResumenMes[];
  /** Meses que se dibujan (día 1), en orden cronológico. */
  visibles: readonly string[];
  hoy: string;
  inicioDatos: string | null;
  /**
   * Mes en curso: se compara con el mismo tramo del mes anterior (sección 8: misma longitud),
   * no con el mes anterior completo. null = no hay ese tramo.
   */
  anteriorEnCurso: { balance: string; tramo: Rango } | null;
}

/**
 * Balance de los últimos meses. Negativo en rojo con signo menos; el mes en curso se marca como
 * provisional («hasta hoy»). Media mensual solo con meses completos (sección 8).
 * Se recorre mes a mes con ratón, dedo (`touch-action: pan-y`) o teclado (control deslizante),
 * como el gráfico de capital de Inicio; la lectura muestra balance, ahorro y comparación.
 */
export function BalanceMensual({ meses, visibles, hoy, inicioDatos, anteriorEnCurso }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const mesActual = inicioDeMes(hoy);
  const porMes = new Map(meses.map((m) => [m.mes, m]));
  const dibujados = visibles.flatMap((v) => porMes.get(v) ?? []);
  const maximo = maximoAbsoluto(dibujados.map((m) => m.balance));
  const media = mediaMensual(dibujados, hoy, inicioDatos);
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: dibujados.length, inicial: dibujados.length - 1 });

  const lectura = (m: ResumenMes) => {
    const enCurso = m.mes === mesActual;
    const previo = sumarMeses(m.mes, -1);
    const filaPrevia = porMes.get(previo);
    const anterior = enCurso
      ? (anteriorEnCurso?.balance ?? null)
      : filaPrevia !== undefined && tramoConDatos(previo, inicioDatos)
        ? filaPrevia.balance
        : null;
    const tramoAnterior = enCurso ? anteriorEnCurso?.tramo : { desde: previo, hasta: finDeMes(previo) };
    const contexto =
      anterior === null || tramoAnterior === undefined
        ? undefined
        : t('comparativa.vs', { importe: formatearEuros(anterior, locale), tramo: formatearTramo(tramoAnterior, locale) });
    const pct = variacionPorcentual(m.balance, anterior);
    const comparacionTexto =
      pct === null
        ? t('comparativa.sinDatosAnterior')
        : `${formatearPorcentaje(pct, locale, { signo: 'siempre' })} ${contexto ?? ''}`.trim();
    return {
      titulo: enCurso ? t('balance.lectura.enCurso', { mes: etiquetaMes(m.mes, locale) }) : etiquetaMes(m.mes, locale),
      valor: formatearEuros(m.balance, locale, { signo: 'siempre' }),
      ahorro: t('balance.lectura.ahorro', { porcentaje: formatearPorcentaje(m.ahorro_pct, locale) }),
      anterior,
      contexto,
      comparacionTexto,
    };
  };
  const elegido = dibujados[indice];
  const sel = elegido ? lectura(elegido) : null;

  return (
    <Card titulo={t('balance.titulo')}>
      {dibujados.length === 0 || !elegido || !sel ? (
        <EmptyState titulo={t('balance.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          <LecturaGrafico data-testid="lectura-balance" titulo={sel.titulo} valor={sel.valor}>
            <span className="cifras text-xs text-apagado sm:text-sm">{sel.ahorro}</span>
            <LineaVariacion
              actual={elegido.balance}
              anterior={sel.anterior}
              subirEsBueno
              {...(sel.contexto !== undefined && { contexto: sel.contexto })}
            />
          </LecturaGrafico>
          <div
            role="slider"
            tabIndex={0}
            aria-label={t('balance.control')}
            aria-valuemin={1}
            aria-valuemax={dibujados.length}
            aria-valuenow={indice + 1}
            aria-valuetext={`${sel.titulo} · ${sel.valor} · ${sel.ahorro} · ${sel.comparacionTexto}`}
            onKeyDown={alTeclado}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            <div
              aria-hidden="true"
              data-testid="superficie-balance"
              className="flex h-52 cursor-crosshair touch-pan-y items-end gap-3 border-b border-borde-fuerte px-1.5 select-none"
              {...superficie}
            >
              {dibujados.map((m, i) => {
                const enCurso = m.mes === mesActual;
                const negativo = signo(m.balance) < 0;
                const esElegido = i === indice;
                return (
                  <div
                    key={m.mes}
                    className={cx(
                      'flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-t-md',
                      esElegido && 'bg-superficie-2',
                    )}
                  >
                    <span className={cx('cifras text-[11px]', negativo ? 'text-negativo' : 'text-apagado')}>
                      {enCurso ? t('balance.hastaHoy') : formatearEuros(m.balance, locale)}
                    </span>
                    <div
                      className={cx(
                        'w-full rounded-t-md',
                        enCurso
                          ? cx('border-2 border-dashed bg-transparent', negativo ? 'border-negativo' : 'border-acento')
                          : negativo
                            ? 'bg-negativo'
                            : 'bg-acento',
                        !esElegido && !enCurso && 'opacity-70',
                      )}
                      style={{ height: `${Math.max(proporcion(m.balance, maximo) * 0.85, 1)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div aria-hidden="true" className="mt-1.5 flex gap-3 px-1.5 text-xs text-apagado">
              {dibujados.map((m, i) => (
                <span key={m.mes} className={cx('flex-1 text-center capitalize', i === indice && 'font-semibold text-texto')}>
                  {mesCorto(m.mes, locale)}
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-apagado sm:text-sm">{t('balance.ayuda')}</p>
          <table className="sr-only">
            <caption>{t('balance.tabla')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('tabla.mes')}</th>
                <th scope="col">{t('tabla.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {dibujados.map((m) => (
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
        </div>
      )}
      <p className="mt-3 text-xs text-apagado sm:text-sm">
        {t('balance.media', { media: media === null ? '—' : formatearEuros(media, locale) })}
        {dibujados.some((m) => m.mes === mesActual) && ` ${t('balance.provisional')}`}
      </p>
    </Card>
  );
}
