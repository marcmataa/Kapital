import type { ReactNode } from 'react';
import { Card, LecturaGrafico } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { aCentimos, desdeCentimos, formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import { maximoAbsoluto, proporcion, type GastoDia } from '../lib/agregaciones';

interface Props {
  dias: readonly GastoDia[];
  /** Total del tramo (gastos netos de SQL y comparación), bajo el título. */
  total?: ReactNode;
}

const MARCAS_EJE = [1, 5, 10, 15, 20, 25];

/**
 * Gasto neto por día. Los días futuros quedan vacíos; el de hoy se dibuja hueco (provisional).
 * Se recorre día a día con ratón, dedo (`touch-action: pan-y`) o teclado (control deslizante),
 * como el gráfico de capital de Inicio. Alternativa accesible: tabla oculta con todos los días.
 */
export function GraficoGastoDiario({ dias, total }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const maximo = maximoAbsoluto(dias.map((d) => d.gasto));
  const ultimo = dias.length;
  // Por defecto, el último día con datos (hoy en el mes en curso, el último del mes si está cerrado).
  const ultimoConDatos = dias.reduce((acc, d, i) => (d.gasto !== null ? i : acc), 0);
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: ultimo, inicial: ultimoConDatos });
  const elegido = dias[indice];

  const etiquetaDia = (d: GastoDia) => formatearFecha(d.fecha, locale, 'media');
  const lectura = (d: GastoDia) => ({
    titulo: d.hoy ? t('diario.lectura.hoy', { fecha: etiquetaDia(d) }) : etiquetaDia(d),
    valor: d.gasto === null ? t('diario.lectura.futuro') : formatearEuros(d.gasto, locale),
  });
  const sel = elegido ? lectura(elegido) : null;
  // Escala del eje: máximo, mitad y 0 (céntimos → texto, sin float).
  const mitad = desdeCentimos(maximo / 2n);

  return (
    <Card titulo={t('diario.titulo')}>
      <div className="flex flex-col gap-3">
        {total}
        {sel && <LecturaGrafico data-testid="lectura-diario" titulo={sel.titulo} valor={sel.valor} />}
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('diario.control')}
          aria-valuemin={1}
          aria-valuemax={ultimo}
          aria-valuenow={indice + 1}
          aria-valuetext={sel ? `${sel.titulo} · ${sel.valor}` : undefined}
          onKeyDown={alTeclado}
          className="flex gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          <div aria-hidden="true" className="flex h-48 min-w-12 flex-col justify-between text-right text-[11px] text-apagado">
            <span className="cifras">{formatearEuros(desdeCentimos(maximo), locale)}</span>
            <span className="cifras">{formatearEuros(mitad, locale)}</span>
            <span className="cifras">{formatearEuros('0', locale)}</span>
          </div>
          <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              data-testid="superficie-diario"
              className="flex h-48 cursor-crosshair touch-pan-y items-end gap-[2px] border-b border-borde-fuerte select-none"
              {...superficie}
            >
              {dias.map((d, i) => {
                const negativo = d.gasto !== null && aCentimos(d.gasto) < 0n;
                const alto = d.gasto === null || negativo ? 0 : proporcion(d.gasto, maximo);
                const esElegido = i === indice;
                return (
                  <div key={d.dia} className="relative flex h-full min-w-0 flex-1 items-end">
                    {esElegido && <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-borde-fuerte" />}
                    <div
                      className={cx(
                        'relative w-full rounded-t-[3px]',
                        d.gasto === null && 'h-0',
                        d.hoy ? 'border-2 border-dashed border-acento bg-transparent' : 'bg-acento',
                        negativo && 'h-0.5 bg-negativo',
                        !esElegido && !d.hoy && 'opacity-70',
                      )}
                      style={d.gasto === null || negativo ? undefined : { height: `${Math.max(alto, 1)}%` }}
                    />
                  </div>
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
        <p className="text-xs text-apagado sm:text-sm">{t('diario.nota')}</p>
      </div>
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
