import { Card, LecturaGrafico } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, desdeCentimos, formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import { maximoAbsoluto, proporcion, type DiaSerie, type MovimientoDia } from '../lib/agregaciones';

export type ModoDiario = 'gastos' | 'ingresos';

interface Props {
  dias: readonly DiaSerie[];
  /**
   * gastos: una barra por día con el gasto neto (gastos − devoluciones, sección 3); al elegir un
   * día, «Gastos X · Devoluciones −Y · Neto Z» y su lista con las devoluciones en verde.
   * ingresos: una barra por día con los ingresos reales. Las devoluciones nunca salen aquí: restan
   * del gasto de su categoría (sección 2).
   */
  modo: ModoDiario;
  /** «Octubre de 2026». */
  nombreMes: string;
}

const MARCAS_EJE = [1, 5, 10, 15, 20, 25];

/**
 * Gráfico por día del mes. Los días futuros quedan vacíos; el de hoy se dibuja hueco (provisional).
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
  const maximo = maximoAbsoluto(dias.flatMap(barras));
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
  const lista = (d: DiaSerie): MovimientoDia[] =>
    (d.datos?.movimientos ?? []).filter((m) => (gastos ? m.tipo !== 'ingreso' : m.tipo === 'ingreso'));
  const textoMovimiento = (m: MovimientoDia) =>
    m.tipo === 'devolucion'
      ? t('diario.lectura.movimientoDevolucion', {
          concepto: m.concepto,
          importe: formatearEuros(m.importe, locale, { signo: 'negativo' }),
        })
      : `${m.concepto} · ${euros(m.importe)}`;

  const mitad = desdeCentimos(maximo / 2n);
  const tituloCard = t(gastos ? 'diario.tituloGastos' : 'diario.tituloIngresos', { mes: nombreMes });

  return (
    <Card titulo={tituloCard}>
      <div className="flex flex-col gap-3">
        {elegido && (
          <LecturaGrafico data-testid="lectura-diario" titulo={titulo(elegido)} valor={valor(elegido)}>
            {detalle(elegido).length > 0 && (
              <span className="cifras text-xs text-apagado sm:text-sm">{detalle(elegido).join(' · ')}</span>
            )}
            {lista(elegido).length > 0 && (
              <ul aria-label={t('diario.lectura.lista')} className="mt-1 flex flex-col gap-0.5 text-xs text-texto sm:text-sm">
                {lista(elegido).map((m) => (
                  <li key={m.id} className={cx('flex justify-between gap-3', m.tipo === 'devolucion' && 'text-positivo')}>
                    <span className="min-w-0 truncate">{m.concepto}</span>
                    <span className="cifras shrink-0">
                      {formatearEuros(m.importe, locale, m.tipo === 'devolucion' && gastos ? { signo: 'negativo' } : {})}
                    </span>
                  </li>
                ))}
              </ul>
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
              ? [`${titulo(elegido)} · ${valor(elegido)}`, ...detalle(elegido), ...lista(elegido).map(textoMovimiento)].join('. ')
              : undefined
          }
          onKeyDown={alTeclado}
          className="flex gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          <div aria-hidden="true" className="flex h-48 min-w-12 flex-col justify-between text-right text-[11px] text-apagado">
            <span className="cifras">{euros(desdeCentimos(maximo))}</span>
            <span className="cifras">{euros(mitad)}</span>
            <span className="cifras">{euros('0')}</span>
          </div>
          <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              data-testid="superficie-diario"
              className="flex h-48 cursor-crosshair touch-pan-y items-end gap-[2px] border-b border-borde-fuerte select-none"
              {...superficie}
            >
              {dias.map((d, i) => {
                const esElegido = i === indice;
                return (
                  <div key={d.dia} className="relative flex h-full min-w-0 flex-1 items-end gap-px">
                    {esElegido && <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-borde-fuerte" />}
                    {barras(d).map((v, j) => {
                      const negativo = aCentimos(v) < 0n;
                      const color = gastos ? 'acento' : 'positivo';
                      return (
                        <div
                          key={j}
                          className={cx(
                            'relative min-w-0 flex-1 rounded-t-[3px]',
                            d.hoy
                              ? cx('border-2 border-dashed bg-transparent', BORDE[color])
                              : negativo
                                ? 'h-0.5 bg-negativo'
                                : FONDO[color],
                            !esElegido && !d.hoy && 'opacity-70',
                          )}
                          style={negativo ? undefined : { height: `${Math.max(proporcion(v, maximo), 1)}%` }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="relative h-4 text-[11px] text-apagado">
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

const FONDO = { acento: 'bg-acento', positivo: 'bg-positivo' } as const;
const BORDE = { acento: 'border-acento', positivo: 'border-positivo' } as const;
