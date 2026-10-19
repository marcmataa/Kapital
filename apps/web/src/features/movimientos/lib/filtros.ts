import { limpiarBusqueda } from './busqueda';
import { esFechaValida, esMetodo, esTipo, esUuid, type MetodoPago, type TipoMovimiento } from './tipos';

/**
 * Filtros de la lista. Viven en la URL (?q=&tipo=&desde=&hasta=&categoria=&metodo=&cuenta=) para
 * que se puedan compartir y el botón «atrás» funcione. Todo lo que llega de la URL se valida:
 * un valor que no encaja se ignora (nunca llega a la consulta).
 */
export interface Filtros {
  q: string;
  tipo: TipoMovimiento | null;
  desde: string | null;
  hasta: string | null;
  categoria: string | null;
  metodo: MetodoPago | null;
  /** Cuenta de origen O de destino. */
  cuenta: string | null;
}

export const FILTROS_VACIOS: Filtros = {
  q: '',
  tipo: null,
  desde: null,
  hasta: null,
  categoria: null,
  metodo: null,
  cuenta: null,
};

const CLAVES = ['q', 'tipo', 'desde', 'hasta', 'categoria', 'metodo', 'cuenta'] as const;

export function filtrosDesdeParams(params: URLSearchParams): Filtros {
  const tipo = params.get('tipo');
  const metodo = params.get('metodo');
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  const categoria = params.get('categoria');
  const cuenta = params.get('cuenta');
  return {
    q: (params.get('q') ?? '').slice(0, 200),
    tipo: esTipo(tipo) ? tipo : null,
    desde: esFechaValida(desde) ? desde : null,
    hasta: esFechaValida(hasta) ? hasta : null,
    categoria: esUuid(categoria) ? categoria : null,
    metodo: esMetodo(metodo) ? metodo : null,
    cuenta: esUuid(cuenta) ? cuenta : null,
  };
}

/**
 * Escribe los filtros en `base` (conserva otros parámetros, p. ej. `sel`) y quita los vacíos.
 */
export function filtrosAParams(filtros: Filtros, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const clave of CLAVES) {
    const valor = filtros[clave];
    if (valor === null || valor === '') params.delete(clave);
    else params.set(clave, valor);
  }
  return params;
}

/** Filtros avanzados activos (los del panel, sin búsqueda ni tipo). */
export function contarFiltrosPanel(f: Filtros): number {
  return [f.desde, f.hasta, f.categoria, f.metodo, f.cuenta].filter((v) => v !== null).length;
}

/** Clave estable para la caché de la consulta (búsqueda ya limpia). */
export function normalizarFiltros(f: Filtros): Filtros {
  return { ...f, q: limpiarBusqueda(f.q) };
}
