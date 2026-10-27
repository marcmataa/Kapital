import { Link } from 'react-router';
import { skipToken } from '@reduxjs/toolkit/query';
import { TriangleAlert } from 'lucide-react';
import { useListarCategoriasQuery } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { nombreCategoria } from '@/shared/lib/categorias';
import { formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { clasesBoton } from '@/shared/ui';
import { useInicioPesoOtrosGastosQuery, type Periodo } from '../api/inicioApi';
import { enlaceMovimientosCategoria } from '../lib/enlaces';

interface Props {
  /** Tramo del mes mostrado; undefined mientras no se sabe cuál es. */
  periodo: Periodo | undefined;
}

/**
 * Aviso cuando «Otros gastos» (clave otros_gastos) pasa del 20 % del gasto del mes
 * (`peso_otros_gastos`, SQL: % sobre la misma base que el reparto por categoría, sección 8). El botón
 * «Recategorizar» abre Movimientos filtrado por esa categoría y el mes. Si falla la carga no se
 * muestra nada: es una sugerencia, no un dato.
 */
export function AvisoOtrosGastos({ periodo }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const tc = useT('common');
  const categorias = useListarCategoriasQuery();
  const { currentData } = useInicioPesoOtrosGastosQuery(periodo ?? skipToken);
  const fila = currentData?.[0];
  if (!periodo || !fila?.supera_umbral) return null;
  const categoria = categorias.data?.find((c) => c.id === fila.categoria_id);

  return (
    <aside
      data-testid="aviso-otros-gastos"
      className="flex flex-col gap-3 rounded-2xl border border-aviso-borde bg-aviso-suave p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2.5 text-sm text-texto">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-aviso" />
        <span>
          {t('otros.aviso', {
            categoria: categoria ? nombreCategoria(categoria, tc) : tc('categoria.otros_gastos'),
            porcentaje: formatearPorcentaje(fila.porcentaje, locale),
            importe: formatearEuros(fila.gasto, locale),
          })}
        </span>
      </p>
      <Link
        to={enlaceMovimientosCategoria(fila.categoria_id, periodo)}
        className={clasesBoton('secundario', 'sm')}
      >
        {t('otros.recategorizar')}
      </Link>
    </aside>
  );
}
