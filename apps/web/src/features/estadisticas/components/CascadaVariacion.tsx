import { useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { geometriaCascada } from '@/shared/lib/cascada';
import { formatearEuros } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { Card } from '@/shared/ui';
import type { Comparativa, GastoCategoria } from '../api/estadisticasApi';
import { pasosVariacionBalance, type PasoVariacion } from '../lib/agregaciones';
import { formatearTramo, signo } from '../lib/formato';
import type { PeriodosComparacion, Rango } from '../lib/periodos';

interface Props {
  periodos: PeriodosComparacion & { anterior: Rango };
  comparativa: Comparativa;
  gastos: readonly GastoCategoria[];
  gastosAnterior: readonly GastoCategoria[];
}

const BARRA = { total: 'bg-apagado', sube: 'bg-positivo', baja: 'bg-negativo' } as const;
const TEXTO = { total: 'text-texto', sube: 'text-positivo', baja: 'text-negativo' } as const;

function sentido(p: PasoVariacion): keyof typeof BARRA {
  if (p.tipo === 'inicio' || p.tipo === 'fin') return 'total';
  return signo(p.importe) >= 0 ? 'sube' : 'baja';
}

/**
 * Por qué cambia el balance de un mes al siguiente, en cascada horizontal (una fila por paso):
 * balance del tramo anterior → lo que cambian los ingresos → lo que cambia el gasto neto de cada
 * categoría (gastar más resta, gastar menos suma), de más a menos peso → balance de este tramo.
 * Verde = sube el balance, rojo = lo baja, gris = los dos balances. Los pasos salen de
 * `pasosVariacionBalance` (céntimos exactos) y cuadran al céntimo con el balance de SQL; si no
 * cuadran, no se dibuja nada inventado.
 */
export function CascadaVariacion({ periodos, comparativa: c, gastos, gastosAnterior }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const nombreCategoria = useNombreCategoriaCatalogo();
  const comoFila = (g: GastoCategoria) => ({ id: g.categoria_id, nombre: nombreCategoria({ id: g.categoria_id, nombre: g.nombre }), importe: g.gasto });
  const pasos = pasosVariacionBalance(
    { ingresos: c.ingresos, ingresosAnterior: c.ingresos_anterior, balance: c.balance, balanceAnterior: c.balance_anterior },
    gastos.map(comoFila),
    gastosAnterior.map(comoFila),
  );
  const tramoAnterior = formatearTramo(periodos.anterior, locale);
  const tramoActual = formatearTramo(periodos.actual, locale);

  const etiqueta = (p: PasoVariacion) => {
    switch (p.tipo) {
      case 'inicio':
        return t('cascada.balance', { tramo: tramoAnterior });
      case 'fin':
        return t('cascada.balance', { tramo: tramoActual });
      case 'ingresos':
        return t('cascada.ingresos');
      case 'resto':
        return t('cascada.resto', { n: String(p.agrupadas ?? 0) });
      default:
        return p.nombre ?? '';
    }
  };
  const importe = (p: PasoVariacion) => formatearEuros(p.importe, locale, { signo: 'siempre' });

  return (
    <Card titulo={t('cascada.titulo')} data-testid="cascada-variacion">
      {pasos === null ? (
        <p role="alert" className="text-sm text-apagado">
          {t('cascada.descuadre')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-apagado sm:text-sm">{t('cascada.nota', { anterior: tramoAnterior, actual: tramoActual })}</p>
          <Filas pasos={pasos} etiqueta={etiqueta} importe={importe} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-apagado sm:text-sm" aria-hidden="true">
            {(['total', 'sube', 'baja'] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cx('size-2.5 rounded-sm', BARRA[s])} />
                {t(`cascada.leyenda.${s}`)}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>{t('cascada.titulo')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('cascada.paso')}</th>
                <th scope="col">{t('cascada.cambio')}</th>
                <th scope="col">{t('cascada.acumulado')}</th>
              </tr>
            </thead>
            <tbody>
              {pasos.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{etiqueta(p)}</th>
                  <td>{importe(p)}</td>
                  <td>{formatearEuros(p.fin, locale, { signo: 'siempre' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Las filas dibujadas: etiqueta, barra (con la línea del cero y el conector al paso siguiente) e importe. */
function Filas({
  pasos,
  etiqueta,
  importe,
}: {
  pasos: readonly PasoVariacion[];
  etiqueta: (p: PasoVariacion) => string;
  importe: (p: PasoVariacion) => string;
}) {
  const { tramos, cero } = geometriaCascada(pasos);
  return (
    <div aria-hidden="true" className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-stretch gap-x-3">
      {tramos.map((b, i) => {
        const s = sentido(b.paso);
        const total = s === 'total';
        return (
          <div key={b.paso.id} className="contents">
            <span
              className={cx(
                'self-center py-1 text-sm leading-tight [overflow-wrap:normal] [word-break:normal]',
                total ? 'font-semibold text-texto' : 'text-apagado',
              )}
            >
              {etiqueta(b.paso)}
            </span>
            <span className="relative min-h-8">
              {cero > 0 && <span className="absolute inset-y-0 border-l border-borde-fuerte" style={{ left: `${cero}%` }} />}
              <span
                data-testid="barra-variacion"
                data-sentido={s}
                className={cx('absolute inset-y-1.5 rounded-sm', BARRA[s])}
                style={{ left: `${b.abajo}%`, width: `${b.alto}%` }}
              />
              {i < tramos.length - 1 && (
                <span
                  className="absolute top-[calc(100%-0.375rem)] h-3 border-l border-dashed border-tenue"
                  style={{ left: `${b.fin}%` }}
                />
              )}
            </span>
            <span
              className={cx(
                'cifras self-center text-right text-sm whitespace-nowrap',
                total ? cx('font-semibold', TEXTO[signo(b.paso.importe) < 0 ? 'baja' : signo(b.paso.importe) > 0 ? 'sube' : 'total']) : TEXTO[s],
              )}
            >
              {importe(b.paso)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
