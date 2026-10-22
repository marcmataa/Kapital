/**
 * Búsqueda por concepto o comercio con un filtro `or(...)` de PostgREST.
 *
 * El texto del usuario acaba dentro de la sintaxis del filtro, así que se limpia antes:
 * - `, ( )` separan condiciones y agrupan: con ellos se podrían inyectar filtros nuevos.
 * - `.` y `:` separan columna, operador y valor; `"` y `\` abren/escapan valores entre comillas.
 * - `*` es el comodín de PostgREST y `%` `_` los de LIKE: el usuario busca texto, no patrones.
 * - `'` y el resto de comillas tipográficas, por si acaso.
 * Todo eso se cambia por espacios; luego se compactan los espacios y se limita la longitud.
 * El valor además va entre comillas dobles, que PostgREST trata como literal.
 */
const RESERVADOS = /[,()*:.\\"'`%_‘’“”]/g;
export const BUSQUEDA_MAXIMA = 80;

/** Caracteres de control (saltos de línea, tabuladores, NUL…) → espacio. */
function sinControl(texto: string): string {
  return Array.from(texto, (c) => {
    const codigo = c.codePointAt(0) ?? 0;
    return codigo < 0x20 || codigo === 0x7f ? ' ' : c;
  }).join('');
}

export function limpiarBusqueda(texto: string | null | undefined): string {
  return sinControl(texto ?? '')
    .replace(RESERVADOS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BUSQUEDA_MAXIMA)
    .trim();
}

/** Filtro para `.or()`; null si no queda nada que buscar. */
export function filtroBusqueda(texto: string | null | undefined): string | null {
  const limpio = limpiarBusqueda(texto);
  if (limpio === '') return null;
  const patron = `"*${limpio}*"`;
  return `concepto.ilike.${patron},comercio.ilike.${patron}`;
}
