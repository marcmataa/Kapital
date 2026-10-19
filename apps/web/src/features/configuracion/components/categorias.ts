import type { Categoria } from '@/shared/api/catalogos';
import { CATEGORIA_RENDIMIENTOS } from '../schemas/categoria';

/**
 * «Rendimientos» (ingreso) no se renombra ni se archiva: `registrar_movimiento` la busca por
 * ese nombre cuando el atajo envía tipo «rendimiento» (reglas, secciones 2 y 8).
 */
export function esProtegida(c: Pick<Categoria, 'nombre' | 'tipo'>): boolean {
  return c.tipo === 'ingreso' && c.nombre === CATEGORIA_RENDIMIENTOS;
}

/** Categorías de un tipo, activas o archivadas, por `orden` (y nombre si empatan). */
export function deTipo(categorias: readonly Categoria[], tipo: Categoria['tipo'], archivadas: boolean): Categoria[] {
  return categorias
    .filter((c) => c.tipo === tipo && c.archivada === archivadas)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/**
 * Mueve la categoría `indice` de `lista` (ya ordenada) una posición (`delta` = -1 sube, 1 baja)
 * y devuelve el nuevo `orden` solo de las que cambian. Reutiliza los valores de `orden` que ya
 * tiene la lista (así no se mezcla con las del otro tipo); si había empates, numera 1..n.
 * Vacío si no se puede mover.
 */
export function reordenar(lista: readonly Categoria[], indice: number, delta: -1 | 1): { id: string; orden: number }[] {
  const destino = indice + delta;
  if (indice < 0 || destino < 0 || destino >= lista.length) return [];
  const huecos = lista.map((c) => c.orden);
  const distintos = new Set(huecos).size === huecos.length;
  const nueva = [...lista];
  const [movida] = nueva.splice(indice, 1);
  if (movida === undefined) return [];
  nueva.splice(destino, 0, movida);
  const cambios: { id: string; orden: number }[] = [];
  nueva.forEach((c, i) => {
    const orden = distintos ? (huecos[i] ?? i + 1) : i + 1;
    if (orden !== c.orden) cambios.push({ id: c.id, orden });
  });
  return cambios;
}
