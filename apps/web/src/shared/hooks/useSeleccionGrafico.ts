import { useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface OpcionesSeleccionGrafico {
  /** Número de posiciones del gráfico (días, barras, categorías). */
  total: number;
  /** Posición elegida al empezar (0 = la primera). */
  inicial: number;
  /**
   * Eje en el que se reparten las posiciones a partes iguales:
   * - 'x' (por defecto): columnas de izquierda a derecha; → / ↑ avanzan.
   * - 'y': filas de arriba abajo; ↓ / → avanzan.
   */
  eje?: 'x' | 'y';
  /** Salto de RePág / AvPág. */
  salto?: number;
}

export interface SeleccionGrafico {
  /** Posición elegida, siempre dentro de [0, total − 1]. */
  indice: number;
  /** Manejadores de puntero para la superficie del gráfico (ratón, dedo o lápiz). */
  superficie: {
    onPointerDown: (e: PointerEvent<Element>) => void;
    onPointerMove: (e: PointerEvent<Element>) => void;
  };
  /** Manejador de teclado para el control deslizante (flechas, Inicio, Fin, RePág, AvPág). */
  alTeclado: (e: KeyboardEvent<Element>) => void;
}

/**
 * Selección de una posición de un gráfico, con el mismo patrón que «Evolución de tu capital» de
 * Inicio: se elige pasando el ratón, arrastrando el dedo (pointer events; la superficie debe
 * llevar `touch-action: pan-y` para que el arrastre horizontal no haga scroll y el vertical sí)
 * o con el teclado desde un control `role="slider"`.
 *
 * La posición sale de dónde cae el puntero dentro de la superficie, repartida a partes iguales.
 * Con el dedo, el navegador captura el puntero en el elemento donde empezó el toque, así que se
 * usan las coordenadas y no el elemento bajo el dedo.
 */
export function useSeleccionGrafico({ total, inicial, eje = 'x', salto = 5 }: OpcionesSeleccionGrafico): SeleccionGrafico {
  const [elegido, setElegido] = useState(inicial);
  const ultimo = Math.max(0, total - 1);
  const acotar = (i: number) => Math.min(ultimo, Math.max(0, i));
  const indice = acotar(elegido);

  const desdePuntero = (e: PointerEvent<Element>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const largo = eje === 'x' ? rect.width : rect.height;
    if (total <= 0 || largo <= 0) return;
    const posicion = eje === 'x' ? e.clientX - rect.left : e.clientY - rect.top;
    setElegido(acotar(Math.floor((posicion / largo) * total)));
  };

  const alTeclado = (e: KeyboardEvent<Element>) => {
    const pasos: Record<string, number> =
      eje === 'x'
        ? { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: salto, PageDown: -salto }
        : { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: salto, PageUp: -salto };
    let siguiente: number | null = null;
    if (e.key in pasos) siguiente = indice + (pasos[e.key] ?? 0);
    else if (e.key === 'Home') siguiente = 0;
    else if (e.key === 'End') siguiente = ultimo;
    if (siguiente === null) return;
    e.preventDefault();
    setElegido(acotar(siguiente));
  };

  return { indice, superficie: { onPointerDown: desdePuntero, onPointerMove: desdePuntero }, alTeclado };
}
