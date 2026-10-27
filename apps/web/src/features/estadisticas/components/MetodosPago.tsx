import { Card, EmptyState } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { compararImportes, formatearEuros } from '@/shared/lib/dinero';
import type { GastoMetodo } from '../api/estadisticasApi';
import { maximoAbsoluto, proporcion } from '../lib/agregaciones';

/**
 * Gasto por método de pago: suma de gastos por método (SQL). Las devoluciones no restan aquí
 * (sección 8: responde a «cómo pago», no a «cuánto gasto»). Una fila por método con su barra.
 */
export function MetodosPago({ metodos }: { metodos: readonly GastoMetodo[] }) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const ordenados = [...metodos].sort((a, b) => compararImportes(b.gasto, a.gasto));
  const maximo = maximoAbsoluto(ordenados.map((m) => m.gasto));

  return (
    <Card
      titulo={
        <>
          {t('metodos.titulo')} <span className="text-sm font-normal text-apagado">· {t('metodos.nota')}</span>
        </>
      }
    >
      {ordenados.length === 0 ? (
        <EmptyState titulo={t('metodos.vacio')} className="py-6" />
      ) : (
        <ul aria-label={t('metodos.titulo')} className="flex flex-col gap-3 text-sm">
          {ordenados.map((m) => (
            <li key={m.metodo ?? 'sin'} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-x-3">
              <span className="truncate text-texto">{t(m.metodo === null ? 'metodo.sin' : `metodo.${m.metodo}`)}</span>
              <span aria-hidden="true" className="block h-2 rounded bg-borde">
                <span className="block h-2 rounded bg-gasto" style={{ width: `${proporcion(m.gasto, maximo)}%` }} />
              </span>
              <span className="cifras text-right text-texto">{formatearEuros(m.gasto, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
