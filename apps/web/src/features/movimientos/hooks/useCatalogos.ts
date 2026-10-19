import { useMemo } from 'react';
import {
  useListarCategoriasQuery,
  useListarCuentasQuery,
  type Categoria,
  type Cuenta,
} from '@/shared/api/catalogos';

export interface Catalogos {
  cuentas: Cuenta[];
  categorias: Categoria[];
  cuentaPorId: Map<string, Cuenta>;
  categoriaPorId: Map<string, Categoria>;
  cargando: boolean;
  error: boolean;
  reintentar: () => void;
}

const VACIO_CUENTAS: Cuenta[] = [];
const VACIO_CATEGORIAS: Categoria[] = [];

/** Cuentas y categorías del usuario, con índices por id para pintar la lista y el detalle. */
export function useCatalogos(): Catalogos {
  const cuentasQ = useListarCuentasQuery();
  const categoriasQ = useListarCategoriasQuery();
  const cuentas = cuentasQ.data ?? VACIO_CUENTAS;
  const categorias = categoriasQ.data ?? VACIO_CATEGORIAS;
  const cuentaPorId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas]);
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  const { refetch: refetchCuentas } = cuentasQ;
  const { refetch: refetchCategorias } = categoriasQ;
  return {
    cuentas,
    categorias,
    cuentaPorId,
    categoriaPorId,
    cargando: cuentasQ.isLoading || categoriasQ.isLoading,
    error: cuentasQ.isError || categoriasQ.isError,
    reintentar: () => {
      void refetchCuentas();
      void refetchCategorias();
    },
  };
}
