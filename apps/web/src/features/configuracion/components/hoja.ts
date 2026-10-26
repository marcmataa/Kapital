/**
 * Clases para las hojas (`Sheet`) de Configuración sin tocar el componente compartido:
 * - TIRADOR: barrita arriba en la hoja inferior del móvil (desde `sm` es un modal y no se ve).
 * - BOTONES / BOTON: botones apilados a ancho completo en móvil (el principal arriba) y en línea
 *   a la derecha desde `sm`.
 */
export const CLASE_TIRADOR =
  'pt-3 sm:pt-0 before:absolute before:top-1.5 before:left-1/2 before:h-1 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-borde-fuerte sm:before:hidden';

export const CLASE_BOTONES = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end';

export const CLASE_BOTON = 'w-full sm:w-auto';
