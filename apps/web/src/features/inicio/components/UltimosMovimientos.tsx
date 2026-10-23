import { Link } from 'react-router';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { Badge, Card, EmptyState, clasesBoton } from '@/shared/ui';
import { useInicioUltimosMovimientosQuery, type MovimientoReciente } from '../api/inicioApi';
import { formatearDiaMes } from '../lib/calculos';
import { ErrorCarga, Esqueleto } from './Estados';

/** Importe con el signo y el color de su tipo (reglas, sección 2). Traspasos y ajustes: neutros. */
function importeDe(m: MovimientoReciente, locale: string): { texto: string; clase: string } {
  switch (m.tipo) {
    case 'gasto':
      return { texto: formatearEuros(m.importe, locale, { signo: 'negativo' }), clase: 'text-negativo' };
    case 'ingreso':
    case 'devolucion':
      return { texto: formatearEuros(m.importe, locale, { signo: 'siempre' }), clase: 'text-positivo' };
    case 'ajuste':
      return {
        texto: formatearEuros(m.sentido === 'resta' ? `-${m.importe}` : m.importe, locale, { signo: 'siempre' }),
        clase: 'text-apagado',
      };
    case 'traspaso':
      return { texto: formatearEuros(m.importe, locale), clase: 'text-apagado' };
  }
}

export function UltimosMovimientos() {
  const t = useT('inicio');
  const nombreCategoria = useNombreCategoria();
  const { locale } = useIdioma();
  const { data, isLoading, isError, refetch } = useInicioUltimosMovimientosQuery();

  return (
    <Card
      titulo={t('movimientos.titulo')}
      accion={
        <Link to="/movimientos" className="text-sm text-enlace hover:underline">
          {t('movimientos.verTodos')}
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Esqueleto key={i} className="h-12" />
          ))}
        </div>
      ) : isError || !data ? (
        <ErrorCarga onReintentar={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          titulo={t('movimientos.vacio')}
          accion={
            <Link to="/movimientos/nuevo" className={clasesBoton('primario', 'sm')}>
              {t('movimientos.anadir')}
            </Link>
          }
        />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {data.map((m) => {
            const importe = importeDe(m, locale);
            const neutro = m.tipo === 'traspaso' || m.tipo === 'ajuste';
            const cuenta =
              m.tipo === 'traspaso' && m.cuenta && m.destino
                ? t('movimientos.traspaso', { origen: m.cuenta.nombre, destino: m.destino.nombre })
                : (m.cuenta?.nombre ?? '');
            return (
              <li key={m.id} className="border-t border-borde first:border-t-0">
                <Link
                  to={`/movimientos/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-superficie-2"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-texto">{m.concepto}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-apagado">
                      <span className="cifras">{formatearDiaMes(m.fecha, locale)}</span>
                      {neutro ? (
                        <Badge>{t(m.tipo === 'traspaso' ? 'movimientos.tipo.traspaso' : 'movimientos.tipo.ajuste')}</Badge>
                      ) : m.categoria ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full"
                            style={{ backgroundColor: m.categoria.color }}
                          />
                          {nombreCategoria(m.categoria)}
                        </span>
                      ) : (
                        <span>{t('movimientos.sinCategoria')}</span>
                      )}
                      {m.tipo === 'devolucion' && <Badge tono="positivo">{t('movimientos.tipo.devolucion')}</Badge>}
                      {cuenta !== '' && <span className="truncate">{cuenta}</span>}
                    </span>
                  </span>
                  <span className={cx('cifras shrink-0 text-sm font-semibold', importe.clase)}>{importe.texto}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
