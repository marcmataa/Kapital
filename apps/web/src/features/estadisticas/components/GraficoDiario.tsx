import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AyudaGrafico, Card, EtiquetasEje, LecturaGrafico, LineasEje } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { escalaDeImportes, posicionEnEje, tramoBarra } from '@/shared/lib/ejes';
import { formatearFecha } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { DiaSerie } from '../lib/agregaciones';

export type ModoDiario = 'gastos' | 'ingresos';

interface Props {
  dias: readonly DiaSerie[];
  /**
   * gastos: una barra por día con el gasto neto (gastos − devoluciones, sección 3); al elegir un
   * día, «Gastos X · Devoluciones −Y · Neto Z» (el dinero del día, sin la lista de compras).
   * ingresos: una barra por día con los ingresos reales. Las devoluciones nunca salen aquí: restan
   * del gasto de su categoría (sección 2).
   */
  modo: ModoDiario;
  /** «Octubre de 2026». */
  nombreMes: string;
  /**
   * Gasto medio diario del tramo (comparativa_estadisticas, SQL): línea de referencia discontinua.
   * Solo en modo gastos; sin ella no se dibuja.
   */
  media?: string | undefined;
}

const MARCAS_EJE = [1, 5, 10, 15, 20, 25];

/**
 * Gráfico por día del mes. Los días futuros quedan vacíos; el de hoy, con relleno rayado (provisional).
 * Eje con números redondos (`shared/lib/ejes`) y los días en negativo, por debajo del cero.
 * Se recorre día a día con ratón, dedo (`touch-action: pan-y`) o teclado (control deslizante),
 * como el gráfico de capital de Inicio. La lectura (totales del día, SQL) solo aparece al pasar
 * el ratón, tocar una barra o usar el teclado, flotando sobre el gráfico. La media diaria es una
 * línea de referencia. Alternativa accesible: tabla oculta con todos los días.
 */
export function GraficoDiario({ dias, modo, nombreMes, media }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const gastos = modo === 'gastos';
  const barras = (d: DiaSerie): string[] =>
    d.datos === null ? [] : [gastos ? d.datos.gasto_neto : d.datos.ingresos];
  const mediaVisible = gastos && media !== undefined && aCentimos(media) > 0n ? media : null;
  // Eje con números redondos (0 / 100 / 200 €); si hay días en negativo, el cero queda dentro.
  const escala = escalaDeImportes(dias.flatMap(barras));
  const ultimo = dias.length;
  const ultimoConDatos = dias.reduce((acc, d, i) => (d.datos !== null ? i : acc), 0);
  const seleccion = useSeleccionGrafico({ total: ultimo, inicial: ultimoConDatos });
  const { indice } = seleccion;
  // La lectura solo se ve mientras se usa el gráfico (ratón encima, dedo o teclado).
  const [activo, setActivo] = useState(false);
  const superficie = {
    onPointerDown: (e: PointerEvent<Element>) => {
      setActivo(true);
      seleccion.superficie.onPointerDown(e);
    },
    onPointerMove: (e: PointerEvent<Element>) => {
      setActivo(true);
      seleccion.superficie.onPointerMove(e);
    },
    // Con ratón se oculta al salir; con el dedo se queda el último día tocado.
    onPointerLeave: (e: PointerEvent<Element>) => {
      if (e.pointerType === 'mouse') setActivo(false);
    },
  };
  const alTeclado = (e: KeyboardEvent<Element>) => {
    setActivo(true);
    seleccion.alTeclado(e);
  };
  const elegido = dias[indice];

  const euros = (v: string) => formatearEuros(v, locale);
  const etiquetaDia = (d: DiaSerie) => formatearFecha(d.fecha, locale, 'media');
  const titulo = (d: DiaSerie) => (d.hoy ? t('diario.lectura.hoy', { fecha: etiquetaDia(d) }) : etiquetaDia(d));
  const valor = (d: DiaSerie) =>
    d.datos === null ? t('diario.lectura.futuro') : euros(gastos ? d.datos.gasto_neto : d.datos.ingresos);
  /** Desglose del día (solo gastos): «Gastos X · Devoluciones −Y · Neto Z». */
  const detalle = (d: DiaSerie): string[] => {
    if (d.datos === null || !gastos) return [];
    const devoluciones = aCentimos(d.datos.devoluciones) !== 0n;
    return [
      t('diario.lectura.gastos', { importe: euros(d.datos.gastos) }),
      ...(devoluciones
        ? [t('diario.lectura.devoluciones', { importe: formatearEuros(d.datos.devoluciones, locale, { signo: 'negativo' }) })]
        : []),
      t('diario.lectura.neto', { importe: euros(d.datos.gasto_neto) }),
    ];
  };
  // Al elegir un día se ve el día y su dinero, no qué se compró: eso está en Movimientos.

  const tituloCard = t(gastos ? 'diario.tituloGastos' : 'diario.tituloIngresos', { mes: nombreMes });

  return (
    <Card titulo={tituloCard} accion={<AyudaGrafico unidad="dia" />}>
      <div className="relative flex flex-col gap-3">
        {activo && elegido && (
          <LecturaGrafico
            data-testid="lectura-diario"
            titulo={titulo(elegido)}
            valor={valor(elegido)}
            className="pointer-events-none absolute top-0 z-10 w-60 max-w-full border border-borde shadow-tarjeta"
            style={{ left: `clamp(0px, calc(${((indice + 0.5) / ultimo) * 100}% - 7.5rem), calc(100% - 15rem))` }}
          >
            {detalle(elegido).length > 0 && (
              <span className="cifras text-[13px] text-apagado">{detalle(elegido).join(' · ')}</span>
            )}
          </LecturaGrafico>
        )}
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('diario.control')}
          aria-valuemin={1}
          aria-valuemax={ultimo}
          aria-valuenow={indice + 1}
          aria-valuetext={
            elegido
              ? [`${titulo(elegido)} · ${valor(elegido)}`, ...detalle(elegido)].join('. ')
              : undefined
          }
          onKeyDown={alTeclado}
          className="flex gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          <EtiquetasEje escala={escala} locale={locale} className="h-48" />
          <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              data-testid="superficie-diario"
              className="relative flex h-48 cursor-crosshair touch-pan-y select-none"
              {...superficie}
            >
              <LineasEje escala={escala} />
              {mediaVisible !== null && (
                <span
                  data-testid="media-diaria"
                  className="pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed border-texto/60"
                  style={{ bottom: `${posicionEnEje(mediaVisible, escala) * 100}%` }}
                >
                  <span className="cifras absolute right-0 bottom-0.5 rounded bg-superficie/85 px-1 text-[13px] text-apagado">
                    {t('diario.media', { importe: euros(mediaVisible) })}
                  </span>
                </span>
              )}
              {dias.map((d, i) => {
                const esElegido = activo && i === indice;
                return (
                  <div key={d.dia} data-dia={d.dia} className="relative flex h-full min-w-0 flex-1 gap-px px-[12%]">
                    {esElegido && <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-borde-fuerte" />}
                    {barras(d).map((v, j) => {
                      // Negativo (te devolvieron más de lo que gastaste): barra roja bajo el cero.
                      const negativo = aCentimos(v) < 0n;
                      const color = negativo ? 'negativo' : gastos ? 'acento' : 'positivo';
                      const { abajo, alto } = tramoBarra(v, escala);
                      return (
                        <span key={j} className="relative h-full min-w-0 flex-1">
                          <span
                            data-provisional={d.hoy ? 'true' : undefined}
                            className={cx(
                              'absolute inset-x-0',
                              negativo ? 'rounded-b-[3px]' : 'rounded-t-[3px]',
                              d.hoy ? cx('relleno-provisional', TEXTO[color]) : FONDO[color],
                              activo && !esElegido && !d.hoy && 'opacity-70',
                            )}
                            style={{ bottom: `${abajo}%`, height: `${alto}%` }}
                          />
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="relative h-4 text-xs text-apagado">
              {[...MARCAS_EJE, ultimo].map((dia) => (
                <span key={dia} className="absolute -translate-x-1/2" style={{ left: `${((dia - 0.5) / ultimo) * 100}%` }}>
                  {dia}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-apagado sm:text-sm">{t(gastos ? 'diario.nota' : 'diario.notaIngresos')}</p>
      </div>
      <table className="sr-only">
        <caption>{tituloCard}</caption>
        <thead>
          <tr>
            <th scope="col">{t('tabla.dia')}</th>
            <th scope="col">{t(gastos ? 'tabla.gastoNeto' : 'tabla.ingresos')}</th>
          </tr>
        </thead>
        <tbody>
          {dias.flatMap((d) =>
            d.datos === null
              ? []
              : [
                  <tr key={d.dia}>
                    <th scope="row">{etiquetaDia(d)}</th>
                    <td>
                      {euros(gastos ? d.datos.gasto_neto : d.datos.ingresos)}
                      {d.hoy && ` (${t('diario.hoy')})`}
                    </td>
                  </tr>,
                ],
          )}
        </tbody>
      </table>
    </Card>
  );
}

const FONDO = { acento: 'bg-acento', positivo: 'bg-positivo', negativo: 'bg-negativo' } as const;
/** Color del rayado provisional (`relleno-provisional` usa currentColor). */
const TEXTO = { acento: 'text-acento', positivo: 'text-positivo', negativo: 'text-negativo' } as const;
