import { Card } from '@/shared/ui';
import { useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { useNombreCuentaCatalogo } from '@/shared/hooks/useNombreCuenta';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import type { Comparativa, FilaFueraBalance, GastoCategoria } from '../api/estadisticasApi';
import { emparejar, type FilaIngresoCategoria } from '../lib/agregaciones';
import { signo } from '../lib/formato';
import type { PeriodosComparacion } from '../lib/periodos';
import { useLineaVs, useTituloComparativa } from './ComparativaMes';
import { FilasComparadas, type FilaVista } from './FilasComparadas';
import { LineaVariacion } from './LineaVariacion';

interface Props {
  periodos: PeriodosComparacion;
  /** Totales y variación del balance (comparativa_estadisticas). */
  comparativa: Comparativa;
  ingresos: readonly FilaIngresoCategoria[];
  ingresosAnterior: readonly FilaIngresoCategoria[];
  gastos: readonly GastoCategoria[];
  gastosAnterior: readonly GastoCategoria[];
  fuera: readonly FilaFueraBalance[];
  fueraAnterior: readonly FilaFueraBalance[];
}

/**
 * «Este mes vs anterior»: lo que cuenta en el balance (ingresos y gastos netos por categoría y el
 * balance, sección 3) y, aparte, lo que no cuenta (traspasos y ajustes, secciones 2 y 3). Todos
 * los importes y la variación vienen de SQL; el grupo B nunca se suma a ningún total.
 */
export function DesgloseBalance(props: Props) {
  const { periodos, comparativa: c } = props;
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const titulo = useTituloComparativa(periodos, 'desglose.titulo');
  const lineaVs = useLineaVs();
  const hayAnterior = periodos.anterior !== null;
  const nombreCategoria = useNombreCategoriaCatalogo();
  // v_fuera_balance trae el nombre de la cuenta, no la clave: la cuenta de efectivo se traduce por catálogo.
  const nombreCuenta = useNombreCuentaCatalogo();
  const deIngreso = (f: FilaIngresoCategoria) => ({
    id: `i-${f.categoria_id}`,
    nombre: nombreCategoria({ id: f.categoria_id, nombre: f.nombre }),
    color: f.color,
    importe: f.ingreso,
  });
  const deGasto = (f: GastoCategoria) => ({
    id: `g-${f.categoria_id}`,
    nombre: nombreCategoria({ id: f.categoria_id, nombre: f.nombre }),
    color: f.color,
    importe: f.gasto,
  });

  const grupoA: FilaVista[] = [
    { id: 'total-ingresos', nombre: t('desglose.ingresos'), actual: c.ingresos, anterior: c.ingresos_anterior, total: true },
    ...emparejar(props.ingresos.map(deIngreso), props.ingresosAnterior.map(deIngreso), hayAnterior),
    { id: 'total-gastos', nombre: t('desglose.gastosNetos'), actual: c.gastos_netos, anterior: c.gastos_netos_anterior, total: true },
    ...emparejar(props.gastos.map(deGasto), props.gastosAnterior.map(deGasto), hayAnterior),
  ];

  const nombreFuera = (f: FilaFueraBalance) =>
    f.tipo === 'traspaso'
      ? t('desglose.traspaso', {
          origen: nombreCuenta({ nombre: f.cuenta }),
          destino: f.cuenta_destino === null ? '' : nombreCuenta({ nombre: f.cuenta_destino }),
        })
      : t(f.sentido === 'resta' ? 'desglose.ajusteResta' : 'desglose.ajusteSuma', { cuenta: nombreCuenta({ nombre: f.cuenta }) });
  const claveFuera = (f: FilaFueraBalance) => `${f.tipo}|${f.cuenta}|${f.cuenta_destino ?? ''}|${f.sentido ?? ''}`;
  const previas = new Map(props.fueraAnterior.map((f) => [claveFuera(f), f]));
  const actuales = new Set(props.fuera.map(claveFuera));
  const grupoB: FilaVista[] = [
    ...props.fuera,
    ...(hayAnterior ? props.fueraAnterior.filter((f) => !actuales.has(claveFuera(f))) : []),
  ].map((f) => {
    const clave = claveFuera(f);
    const enActual = actuales.has(clave);
    return {
      id: clave,
      nombre: nombreFuera(f),
      actual: enActual ? f.importe : '0.00',
      anterior: hayAnterior ? (enActual ? (previas.get(clave)?.importe ?? '0.00') : f.importe) : null,
      ...(f.tipo === 'ajuste' && { signo: f.sentido === 'resta' ? ('negativo' as const) : ('siempre' as const) }),
    };
  });

  const sBalance = signo(c.balance);
  // «+38,00 € vs +382,00 € el mes pasado», con el % aparte.
  const vsBalance = lineaVs(c.balance, c.balance_anterior, { signo: 'siempre' });
  return (
    <Card titulo={titulo}>
      <section aria-labelledby="desglose-cuenta" className="flex flex-col gap-3">
        <h3 id="desglose-cuenta" className="text-sm font-semibold text-apagado">
          {t('desglose.cuenta')}
        </h3>
        <FilasComparadas filas={grupoA} etiqueta={t('desglose.cuenta')} etiquetaAnterior={t('desglose.antes')} />
        <div
          data-testid="fila-balance"
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-borde-fuerte pt-3"
        >
          <span className="font-semibold text-texto">{t('desglose.balance')}</span>
          <span className="flex flex-col items-end gap-0.5">
            <span className={cx('cifras text-lg font-bold', sBalance < 0 ? 'text-negativo' : sBalance > 0 ? 'text-positivo' : 'text-texto')}>
              {formatearEuros(c.balance, locale, { signo: 'siempre' })}
            </span>
            {vsBalance !== null && (
              <span data-testid="balance-vs" className="cifras text-xs text-apagado sm:text-sm">
                {vsBalance}
              </span>
            )}
            <LineaVariacion actual={c.balance} anterior={c.balance_anterior} porcentaje={c.variacion_balance} subirEsBueno />
          </span>
        </div>
      </section>

      <section
        aria-labelledby="desglose-fuera"
        data-testid="fuera-del-balance"
        className="mt-5 flex flex-col gap-3 rounded-xl border border-dashed border-borde-fuerte p-3.5"
      >
        <h3 id="desglose-fuera" className="text-sm font-semibold text-apagado">
          {t('desglose.fuera')}
        </h3>
        <p className="text-xs text-apagado sm:text-sm">{t('desglose.fueraNota')}</p>
        {grupoB.length === 0 ? (
          <p className="text-sm text-apagado">{t('desglose.sinFuera')}</p>
        ) : (
          <FilasComparadas filas={grupoB} etiqueta={t('desglose.fuera')} etiquetaAnterior={t('desglose.antes')} leyenda={false} />
        )}
      </section>
    </Card>
  );
}
