import { Card } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import type { ResumenPeriodo } from '../api/estadisticasApi';
import { formatearTramo } from '../lib/formato';
import type { Rango } from '../lib/periodos';
import { LineaVariacion } from './LineaVariacion';

interface Props {
  actual: ResumenPeriodo;
  anterior: ResumenPeriodo;
  rangoActual: Rango;
  rangoAnterior: Rango;
}

/** Interanual (sección 8): el tramo seleccionado contra el mismo tramo del año anterior. */
export function Interanual({ actual, anterior, rangoActual, rangoAnterior }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const filas = [
    { campo: 'ingresos', etiqueta: t('interanual.ingresos'), subirEsBueno: true },
    { campo: 'gastos_netos', etiqueta: t('interanual.gastosNetos'), subirEsBueno: false },
    { campo: 'balance', etiqueta: t('interanual.balance'), subirEsBueno: true },
  ] as const;

  return (
    <Card
      titulo={t('interanual.titulo', {
        actual: formatearTramo(rangoActual, locale),
        anterior: formatearTramo(rangoAnterior, locale),
      })}
    >
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {filas.map((f) => (
          <div key={f.campo} className="flex flex-col gap-1">
            <dt className="text-sm text-apagado">{f.etiqueta}</dt>
            <dd className="flex flex-col gap-1">
              <span className="cifras text-lg font-bold text-texto">{formatearEuros(actual[f.campo], locale)}</span>
              <LineaVariacion
                actual={actual[f.campo]}
                anterior={anterior[f.campo]}
                subirEsBueno={f.subirEsBueno}
                // El balance puede ser ≤ 0: diferencia en euros y % solo con las dos bases > 0 (sección 8).
                diferencia={f.campo === 'balance'}
                contexto={t('interanual.vs', { importe: formatearEuros(anterior[f.campo], locale) })}
              />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
