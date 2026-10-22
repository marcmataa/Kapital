import { Card, EmptyState } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import type { GastoMetodo } from '../api/estadisticasApi';

/** «Cómo pagas»: suma de gastos por método. Las devoluciones no restan aquí (sección 8). */
export function MetodosPago({ metodos }: { metodos: readonly GastoMetodo[] }) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const ordenados = [...metodos].sort((a, b) => {
    const ca = aCentimos(a.gasto);
    const cb = aCentimos(b.gasto);
    return ca === cb ? 0 : ca > cb ? -1 : 1;
  });

  return (
    <Card
      titulo={
        <>
          {t('metodos.titulo')}{' '}
          <span className="text-sm font-normal text-apagado">· {t('metodos.nota')}</span>
        </>
      }
    >
      {ordenados.length === 0 ? (
        <EmptyState titulo={t('metodos.vacio')} className="py-6" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ordenados.map((m) => (
            <li key={m.metodo ?? 'sin'} className="flex flex-col gap-1 rounded-xl bg-superficie-2 p-3.5">
              <span className="text-sm text-apagado">{t(m.metodo === null ? 'metodo.sin' : `metodo.${m.metodo}`)}</span>
              <span className="cifras text-lg font-bold text-texto">{formatearEuros(m.gasto, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
