/*
 * Última lista de movimientos que se vio, con sus filtros (`/movimientos?categoria=…`). El detalle
 * y los formularios vuelven ahí, no a la lista sin filtrar. Se guarda en sessionStorage para que
 * sobreviva a una recarga (botón «Recargar») y muera al cerrar la app.
 */

const CLAVE = 'kapital.rutaLista';
const BASE = '/movimientos';

/** Guarda la búsqueda de la lista (sin `sel`, que es la fila abierta en escritorio). */
export function recordarLista(params: URLSearchParams): void {
  const p = new URLSearchParams(params);
  p.delete('sel');
  const busqueda = p.toString();
  try {
    if (busqueda === '') sessionStorage.removeItem(CLAVE);
    else sessionStorage.setItem(CLAVE, busqueda);
  } catch {
    // Sin almacenamiento (modo privado estricto): se vuelve a la lista sin filtros.
  }
}

/** Ruta de la última lista vista; `/movimientos` si no hay ninguna. */
export function rutaLista(): string {
  try {
    const busqueda = sessionStorage.getItem(CLAVE);
    return busqueda ? `${BASE}?${busqueda}` : BASE;
  } catch {
    return BASE;
  }
}
