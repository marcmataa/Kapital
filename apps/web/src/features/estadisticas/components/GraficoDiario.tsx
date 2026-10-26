import { AyudaGrafico, Card, EtiquetasEje, LecturaGrafico, LineasEje } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { escalaDeImportes, tramoBarra } from '@/shared/lib/ejes';
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
}

const MARCAS_EJE = [1, 5, 10, 15, 20, 25];

/**
 * Gráfico por día del mes. Los días futuros quedan vacíos; el de hoy, con relleno rayado (provisional).
 * Eje con números redondos (`shared/lib/ejes`) y los días en negativo, por debajo del cero.
 * Se recorre día a día con ratón, dedo (`touch-action: pan-y`) o teclado (control deslizante),
 * como el gráfico de capital de Inicio. La lectura muestra los totales del día (SQL) y sus
 * movimientos. Alternativa accesible: tabla oculta con todos los días.
 */
export function GraficoDiario({ dias, modo, nombreMes }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const gastos = modo === 'gastos';
  const barras = (d: DiaSerie): string[] =>
    d.datos === null ? [] : [gastos ? d.datos.gasto_neto : d.datos.ingresos];
  // Eje con números redondos (0 / 100 / 200 €); si hay días en negativo, el cero queda dentro.
  const escala = escalaDeImportes(dias.flatMap(barras));
  const ultimo = dias.length;
  const ultimoConDatos = dias.reduce((acc, d, i) => (d.datos !== null ? i : acc), 0);
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: ultimo, inicial: ultimoConDatos });
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
    // El gráfico crece con la tarjeta (la de al lado, la comparativa, suele ser más alta): sin hueco abajo.
    <Card titulo={tituloCard} accion={<AyudaGrafico unidad="dia" />} className="flex flex-col">
      <div className="flex flex-1 flex-col gap-3">
        {elegido && (
          <LecturaGrafico data-testid="lectura-diario" titulo={titulo(elegido)} valor={valor(elegido)}>
            {detalle(elegido).length > 0 && (
              <span className="cifras text-xs text-apagado sm:text-sm">{detalle(elegido).join(' · ')}</span>
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
          className="flex min-h-56 flex-1 gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          {/* Mismo alto que el área de barras: todo menos la fila de días (h-4) y su separación (gap-1.5). */}
          <EtiquetasEje escala={escala} locale={locale} className="mb-5.5 self-stretch" />
          <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              data-testid="superficie-diario"
              className="relative flex min-h-48 flex-1 cursor-crosshair touch-pan-y gap-[2px] select-none"
              {...superficie}
            >
              <LineasEje escala={escala} />
              {dias.map((d, i) => {
                const esElegido = i === indice;
                return (
                  <div key={d.dia} data-dia={d.dia} className="relative flex h-full min-w-0 flex-1 gap-px">
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
                              !esElegido && !d.hoy && 'opacity-70',
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
