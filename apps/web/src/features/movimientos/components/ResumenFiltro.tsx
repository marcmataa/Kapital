import type { ReactNode } from 'react';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { Spinner } from '@/shared/ui';
import { useMovimientosResumenFiltroQuery } from '../api/sqlApi';
import type { Catalogos } from '../hooks/useCatalogos';
import type { Filtros } from '../lib/filtros';

interface Props {
  filtros: Filtros;
  hayFiltros: boolean;
  catalogos: Pick<Catalogos, 'categoriaPorId'>;
}

function Dato({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: string | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-borde pt-3">
      <dt className="text-xs text-apagado">{etiqueta}</dt>
      <dd className={cx('text-lg font-semibold tabular-nums', tono ?? 'text-texto')}>{valor}</dd>
      {detalle !== undefined && <dd className="text-xs text-apagado">{detalle}</dd>}
    </div>
  );
}

/**
 * Panel de escritorio sin movimiento elegido: resumen del filtro activo. Todo sale de
 * `resumen_filtro` (SQL): número de movimientos, balance (sección 3: sin traspasos ni ajustes),
 * gasto medio diario y categoría principal (mayor gasto neto, sección 8). Los ajustes, aparte.
 */
export function ResumenFiltro({ filtros, hayFiltros, catalogos }: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const { data, isLoading, isError } = useMovimientosResumenFiltroQuery(filtros);

  let cuerpo;
  if (isLoading) {
    cuerpo = (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  } else if (isError || !data) {
    cuerpo = <p className="text-sm text-apagado">{t('resumen.error')}</p>;
  } else {
    const euros = (v: string | null, signo: 'auto' | 'siempre' = 'auto') =>
      v === null ? t('detalle.sinDato') : formatearEuros(v, locale, { signo });
    const tonoBalance =
      data.balance === null || aCentimos(data.balance) === 0n
        ? undefined
        : aCentimos(data.balance) > 0n
          ? 'text-positivo'
          : 'text-negativo';
    const categoria = data.categoria_id === null ? undefined : catalogos.categoriaPorId.get(data.categoria_id);
    cuerpo = (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Dato etiqueta={t('resumen.movimientos')} valor={String(data.n)} />
        <Dato etiqueta={t('resumen.balance')} valor={euros(data.balance, 'siempre')} tono={tonoBalance} />
        <Dato etiqueta={t('resumen.ingresos')} valor={euros(data.ingresos)} />
        <Dato etiqueta={t('resumen.gastosNetos')} valor={euros(data.gastos_netos)} />
        <Dato
          etiqueta={t('resumen.mediaDiaria')}
          valor={euros(data.gasto_medio_diario)}
          detalle={data.dias === null ? undefined : t('resumen.enDias', { n: data.dias })}
        />
        <Dato
          etiqueta={t('resumen.categoriaPrincipal')}
          valor={categoria ? nombreCategoria(categoria) : t('detalle.sinDato')}
          detalle={data.categoria_gasto === null ? undefined : formatearEuros(data.categoria_gasto, locale)}
        />
        {data.ajustes !== null && aCentimos(data.ajustes) !== 0n && (
          <div className="col-span-2">
            <Dato etiqueta={t('resumen.ajustes')} valor={euros(data.ajustes, 'siempre')} tono="text-apagado" />
          </div>
        )}
      </dl>
    );
  }

  return (
    <section aria-labelledby="resumen-filtro" className="flex flex-col gap-3">
      <div>
        <h2 id="resumen-filtro" className="text-base font-semibold text-texto">
          {hayFiltros ? t('resumen.tituloFiltro') : t('resumen.titulo')}
        </h2>
        <p className="mt-0.5 text-sm text-apagado">{t('resumen.ayuda')}</p>
      </div>
      {cuerpo}
    </section>
  );
}
