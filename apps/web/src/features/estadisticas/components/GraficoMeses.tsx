import { AyudaGrafico, Card, EmptyState, EtiquetasEje, LecturaGrafico, LineasEje } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { escalaDeImportes, posicionEnEje, tramoBarra } from '@/shared/lib/ejes';
import { inicioDeMes } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { capitalizar, etiquetaMes, mesCorto, mesDesde, nombreMes } from '../lib/formato';
import type { ReferenciaEnCurso } from './GraficoBalanceMeses';

interface Props {
  /** Meses a dibujar (resumen_mensual), en orden cronológico. */
  meses: readonly ResumenMes[];
  hoy: string;
  /** Qué se dibuja: el gasto neto (por defecto) o los ingresos de cada mes. */
  campo?: 'gastos_netos' | 'ingresos';
  /**
   * Solo con el mes en curso: el mismo importe del mes anterior hasta el mismo día (comparativa,
   * SQL). Se marca sobre la barra provisional: un mes a medias no se compara con uno completo.
   */
  referencia?: ReferenciaEnCurso | undefined;
  /** Solo gasto y mes en curso: proyección del gasto neto a fin de mes (ritmo_gasto, SQL). */
  proyeccion?: string | null | undefined;
}

const TEXTOS = {
  gastos_netos: {
    titulo: 'meses.titulo',
    tituloDesde: 'meses.tituloDesde',
    control: 'meses.control',
    ayuda: 'meses.ayuda',
    ayudaCerrado: 'meses.ayudaCerrado',
    definicion: 'ayuda.gastoNeto',
    tabla: 'tabla.gastoNeto',
  },
  ingresos: {
    titulo: 'mesesIngresos.titulo',
    tituloDesde: 'mesesIngresos.tituloDesde',
    control: 'mesesIngresos.control',
    ayuda: 'mesesIngresos.ayuda',
    ayudaCerrado: 'mesesIngresos.ayudaCerrado',
    definicion: 'ayuda.ingresos',
    tabla: 'tabla.ingresos',
  },
} as const;

/**
 * Gasto neto (o ingresos) de los últimos meses (resumen_mensual, sección 3). El mes en curso es
 * provisional («hasta hoy», relleno rayado) y lleva, si se pasan, la marca del mes anterior al
 * mismo día y la proyección a fin de mes (contorno punteado). Eje con números redondos; un mes en
 * negativo (más devoluciones que gastos) baja del cero. Con pocos meses las barras no se
 * ensanchan (ancho máximo). Se recorre mes a mes con ratón, dedo (`touch-action: pan-y`) o teclado.
 */
export function GraficoMeses({ meses, hoy, campo = 'gastos_netos', referencia, proyeccion }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const textos = TEXTOS[campo];
  // Con menos de 6 meses de datos, el título dice desde cuándo: «Últimos 6 meses» con 2 barras engaña.
  const primero = meses[0];
  const tituloTarjeta =
    primero !== undefined && meses.length < 6 ? t(textos.tituloDesde, { mes: mesDesde(primero.mes, locale) }) : t(textos.titulo);
  const mesActual = inicioDeMes(hoy);
  const hayEnCurso = meses.some((m) => m.mes === mesActual);
  const ref = hayEnCurso ? referencia : undefined;
  const proy = hayEnCurso && proyeccion != null ? proyeccion : null;
  const escala = escalaDeImportes([...meses.map((m) => m[campo]), ...(ref ? [ref.importe] : []), ...(proy !== null ? [proy] : [])]);
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: meses.length, inicial: meses.length - 1 });
  const elegido = meses[indice];
  const titulo = (m: ResumenMes) =>
    m.mes === mesActual ? t('meses.lectura.enCurso', { mes: etiquetaMes(m.mes, locale) }) : etiquetaMes(m.mes, locale);
  const nombreRef = ref ? capitalizar(nombreMes(ref.mes, locale)) : '';
  const detalle = (m: ResumenMes): string[] =>
    m.mes !== mesActual
      ? []
      : [
          ...(ref ? [t('balanceMeses.referencia', { mes: nombreRef, dia: String(ref.dia), importe: formatearEuros(ref.importe, locale) })] : []),
          ...(proy !== null ? [t('meses.proyeccion', { importe: formatearEuros(proy, locale) })] : []),
        ];

  return (
    <Card titulo={tituloTarjeta} accion={<AyudaGrafico unidad="mes" definicion={t(textos.definicion)} />}>
      {!elegido ? (
        <EmptyState titulo={t('balance.vacio')} className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          <LecturaGrafico data-testid="lectura-meses" titulo={titulo(elegido)} valor={formatearEuros(elegido[campo], locale)}>
            {detalle(elegido).length > 0 && (
              <span className="cifras text-xs text-apagado sm:text-sm">{detalle(elegido).join(' · ')}</span>
            )}
          </LecturaGrafico>
          <div
            role="slider"
            tabIndex={0}
            aria-label={t(textos.control)}
            aria-valuemin={1}
            aria-valuemax={meses.length}
            aria-valuenow={indice + 1}
            aria-valuetext={[`${titulo(elegido)} · ${formatearEuros(elegido[campo], locale)}`, ...detalle(elegido)].join('. ')}
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
                  const importe = m[campo];
                  const negativo = aCentimos(importe) < 0n;
                  const { abajo, alto } = tramoBarra(importe, escala);
                  // Proyección: contorno punteado desde lo que llevas hasta donde acabarías el mes.
                  const fantasma =
                    enCurso && proy !== null && aCentimos(proy) > aCentimos(importe) && !negativo
                      ? { abajo: abajo + alto, alto: posicionEnEje(proy, escala) * 100 - (abajo + alto) }
                      : null;
                  return (
                    <div
                      key={m.mes}
                      className={cx('relative flex h-full min-w-0 flex-1 justify-center rounded-md', esElegido && 'bg-superficie-2')}
                    >
                      <div className="relative h-full w-full max-w-10">
                        {fantasma !== null && (
                          <span
                            data-testid="proyeccion-mes"
                            className="absolute inset-x-0 rounded-t-md border-2 border-b-0 border-dashed border-apagado"
                            style={{ bottom: `${fantasma.abajo}%`, height: `${fantasma.alto}%` }}
                          />
                        )}
                        <span
                          data-provisional={enCurso ? 'true' : undefined}
                          data-importe={importe}
                          className={cx(
                            'absolute inset-x-0',
                            negativo ? 'rounded-b-md' : fantasma === null && 'rounded-t-md',
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
                          style={
                            negativo
                              ? { bottom: `${abajo}%`, transform: 'translateY(100%)' }
                              : { bottom: `calc(${fantasma !== null ? fantasma.abajo + fantasma.alto : abajo + alto}% + 2px)` }
                          }
                        >
                          {formatearEuros(importe, locale)}
                        </span>
                        {enCurso && ref !== undefined && (
                          <span
                            data-testid="marca-referencia"
                            data-importe={ref.importe}
                            className="absolute -inset-x-1 border-t-2 border-dashed border-texto"
                            style={{ bottom: `${posicionEnEje(ref.importe, escala) * 100}%` }}
                          />
                        )}
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
          {(hayEnCurso || ref !== undefined || proy !== null) && (
            <span aria-hidden="true" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-apagado sm:text-sm">
              {hayEnCurso && (
                <span className="flex items-center gap-1.5">
                  <span className="relleno-provisional size-2.5 rounded-sm text-apagado" />
                  {t('balanceMeses.leyenda.provisional')}
                </span>
              )}
              {ref !== undefined && (
                <span className="flex items-center gap-1.5">
                  <span className="block h-0 w-3 border-t-2 border-dashed border-texto" />
                  {t('balanceMeses.leyenda.referencia', { mes: nombreRef, dia: String(ref.dia) })}
                </span>
              )}
              {proy !== null && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border-2 border-dashed border-apagado" />
                  {t('meses.leyenda.proyeccion')}
                </span>
              )}
            </span>
          )}
          <p className="text-[13px] text-apagado sm:text-sm">{t(hayEnCurso ? textos.ayuda : textos.ayudaCerrado)}</p>
          <table className="sr-only">
            <caption>{tituloTarjeta}</caption>
            <thead>
              <tr>
                <th scope="col">{t('tabla.mes')}</th>
                <th scope="col">{t(textos.tabla)}</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <th scope="row">{titulo(m)}</th>
                  <td>
                    {formatearEuros(m[campo], locale)}
                    {detalle(m).length > 0 && ` (${detalle(m).join('; ')})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
