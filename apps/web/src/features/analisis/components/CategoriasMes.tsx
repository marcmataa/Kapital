import { RepartoCategorias, type CategoriaReparto } from '@/features/inicio/components/RepartoCategorias';
import { Card, EmptyState } from '@/shared/ui';
import { useColorCategoriaCatalogo, useNombreCategoriaCatalogo } from '@/shared/hooks/useNombreCategoria';
import { useT } from '@/shared/i18n';
import { aCentimos } from '@/shared/lib/dinero';
import type { DatosAnalisis } from '../schemas/esquemas';

const COLOR_POR_DEFECTO = '#8f9bbd';

/**
 * Gasto neto por categoría del snapshot, con el mismo reparto que Inicio. Aplica la
 * sección 8: % sobre la suma de las categorías positivas (suman 100 %) y las categorías en negativo se listan en rojo pero no
 * entran en la barra.
 */
export function CategoriasMes({ datos }: { datos: DatosAnalisis }) {
  const t = useT('analisis');
  const nombreCategoria = useNombreCategoriaCatalogo();
  const colorActual = useColorCategoriaCatalogo();
  // `datos.categorias` no trae id: el nombre es único por usuario y sirve de id (y para buscar
  // la clave en el catálogo y mostrar traducidas las categorías por defecto).
  const categorias: CategoriaReparto[] = datos.categorias.map((c) => ({
    id: c.nombre,
    nombre: nombreCategoria({ nombre: c.nombre }),
    // El de hoy, no el guardado en el snapshot: el mismo color que en Inicio y Estadísticas (F07).
    color: colorActual(c.nombre, c.color) ?? COLOR_POR_DEFECTO,
    gasto: c.gasto,
  }));
  const hayGasto = categorias.some((c) => aCentimos(c.gasto) !== 0n);
  // La barra agrupa en «Resto» lo mismo que la cascada de esta pantalla (cascada_analisis, SQL:
  // las 7 de más gasto sueltas). Snapshots antiguos sin cascada: la regla por defecto.
  const pasosCategoria = datos.cascada.filter((p) => p.tipo === 'categoria' && p.nombre !== null);
  const sueltas = datos.cascada.length > 0 ? new Set(pasosCategoria.map((p) => p.nombre as string)) : undefined;

  return (
    <Card titulo={t('categorias.titulo')}>
      {hayGasto ? (
        <RepartoCategorias
          categorias={categorias}
          totalGastoNeto={datos.resumen.gastos_netos}
          etiquetaTotal={t('categorias.etiquetaTotal')}
          sueltas={sueltas}
        />
      ) : (
        <EmptyState titulo={t('categorias.vacio')} className="py-6" />
      )}
    </Card>
  );
}
