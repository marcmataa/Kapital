import { Card, EmptyState, LecturaGrafico } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { useSeleccionGrafico } from '@/shared/hooks/useSeleccionGrafico';
import { formatearEuros } from '@/shared/lib/dinero';
import { inicioDeMes } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { ResumenMes } from '../api/estadisticasApi';
import { maximoAbsoluto, proporcion } from '../lib/agregaciones';
import { etiquetaMes, mesCorto } from '../lib/formato';

interface Props {
  /** Meses a dibujar (resumen_mensual), en orden cronológico. */
  meses: readonly ResumenMes[];
  hoy: string;
}

/**
 * Gastos netos de los últimos meses (resumen_mensual, sección 3). El mes en curso es provisional
 * («hasta hoy»). Se recorre mes a mes con ratón, dedo (`touch-action: pan-y`) o teclado.
 */
export function GraficoMeses({ meses, hoy }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const mesActual = inicioDeMes(hoy);
  const maximo = maximoAbsoluto(meses.map((m) => m.gastos_netos));
  const { indice, superficie, alTeclado } = useSeleccionGrafico({ total: meses.length, inicial: meses.length - 1 });
  const elegido = meses[indice];
  const titulo = (m: ResumenMes) =>
    m.mes === mesActual ? t('meses.lectura.enCurso', { mes: etiquetaMes(m.mes, locale) }) : etiquetaMes(m.mes, locale);

  return (
    <Card titulo={t('meses.titulo')}>
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
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            <div
              aria-hidden="true"
              data-testid="superficie-meses"
              className="flex h-44 cursor-crosshair touch-pan-y items-end gap-3 border-b border-borde-fuerte px-1.5 select-none"
              {...superficie}
            >
              {meses.map((m, i) => {
                const enCurso = m.mes === mesActual;
                const esElegido = i === indice;
                return (
                  <div
                    key={m.mes}
                    className={cx(
                      'flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-t-md',
                      esElegido && 'bg-superficie-2',
                    )}
                  >
                    <span className="cifras text-[11px] text-apagado">{formatearEuros(m.gastos_netos, locale)}</span>
                    <div
                      className={cx(
                        'w-full rounded-t-md',
                        enCurso ? 'border-2 border-dashed border-acento bg-transparent' : 'bg-acento',
                        !esElegido && !enCurso && 'opacity-70',
                      )}
                      style={{ height: `${Math.max(proporcion(m.gastos_netos, maximo) * 0.8, 1)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div aria-hidden="true" className="mt-1.5 flex gap-3 px-1.5 text-xs text-apagado">
              {meses.map((m, i) => (
                <span key={m.mes} className={cx('flex-1 text-center capitalize', i === indice && 'font-semibold text-texto')}>
                  {mesCorto(m.mes, locale)}
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-apagado sm:text-sm">{t('meses.ayuda')}</p>
        </div>
      )}
    </Card>
  );
}
