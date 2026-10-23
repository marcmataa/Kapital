import { useCallback, useMemo } from 'react';
import { useListarCategoriasQuery, type Categoria } from '@/shared/api/catalogos';
import { useT } from '@/shared/i18n';
import { nombreCategoria, type CategoriaConNombre } from '@/shared/lib/categorias';

/**
 * `nombreDe(categoria)`: nombre visible de una categoría que ya trae su `clave`
 * (filas de `categorias` o relaciones que la piden en el select).
 */
export function useNombreCategoria(): (categoria: CategoriaConNombre) => string {
  const t = useT('common');
  return useCallback((categoria: CategoriaConNombre) => nombreCategoria(categoria, t), [t]);
}

const SIN_CATEGORIAS: Categoria[] = [];

/**
 * Para datos que traen el nombre pero no la clave (funciones SQL como gasto_por_categoria, o el
 * snapshot del análisis): busca la clave en el catálogo de categorías, por id si lo hay y si no
 * por nombre (único por usuario). Si no la encuentra, se muestra el nombre tal cual.
 */
export function useNombreCategoriaCatalogo(): (categoria: { id?: string | null; nombre: string }) => string {
  const t = useT('common');
  const { data = SIN_CATEGORIAS } = useListarCategoriasQuery();
  const { porId, porNombre } = useMemo(
    () => ({
      porId: new Map(data.map((c) => [c.id, c])),
      porNombre: new Map(data.map((c) => [c.nombre, c])),
    }),
    [data],
  );
  return useCallback(
    ({ id, nombre }: { id?: string | null; nombre: string }) => {
      const enCatalogo = (id ? porId.get(id) : undefined) ?? porNombre.get(nombre);
      // Solo se traduce si el catálogo confirma que es la misma categoría con ese nombre.
      const clave = enCatalogo?.nombre === nombre ? enCatalogo.clave : null;
      return nombreCategoria({ nombre, clave }, t);
    },
    [porId, porNombre, t],
  );
}
