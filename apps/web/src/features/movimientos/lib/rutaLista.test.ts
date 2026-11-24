import { beforeEach, describe, expect, it } from 'vitest';
import { recordarLista, rutaLista } from './rutaLista';

describe('rutaLista · volver a la lista con sus filtros', () => {
  beforeEach(() => sessionStorage.clear());

  it('sin lista vista, vuelve a /movimientos', () => {
    expect(rutaLista()).toBe('/movimientos');
  });

  it('recuerda los filtros (p. ej. la categoría Suscripciones) y quita la fila abierta (sel)', () => {
    recordarLista(new URLSearchParams('categoria=c-suscripciones&tipo=gasto&sel=m-1'));
    expect(rutaLista()).toBe('/movimientos?categoria=c-suscripciones&tipo=gasto');
  });

  it('al ver la lista sin filtros, se olvidan los anteriores', () => {
    recordarLista(new URLSearchParams('categoria=c-suscripciones'));
    recordarLista(new URLSearchParams(''));
    expect(rutaLista()).toBe('/movimientos');
  });
});
