import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { useTituloDocumento } from '@/shared/layout';

interface Props {
  titulo: string;
  volverA: string;
  children: ReactNode;
}

/**
 * Pantalla de un formulario de movimiento.
 * - Móvil: pantalla completa por encima de la cabecera fija y de la barra inferior (el título no
 *   queda tapado y el «+» no estorba). El botón Guardar del formulario va fijo abajo.
 * - Escritorio (≥ lg): página normal dentro del layout, centrada.
 */
export function PantallaFormulario({ titulo, volverA, children }: Props) {
  const tc = useT('common');
  useTituloDocumento(titulo);
  return (
    <div
      data-pantalla-formulario=""
      className="fixed inset-0 z-(--z-sheet) flex flex-col bg-fondo lg:static lg:z-auto lg:mx-auto lg:block lg:w-full lg:max-w-xl lg:bg-transparent"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-borde px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 lg:mb-6 lg:border-0 lg:p-0">
        <Link
          to={volverA}
          aria-label={tc('accion.volver')}
          className="rounded-lg p-2 text-apagado transition-colors hover:bg-superficie-2 hover:text-texto focus-visible:outline-2 focus-visible:outline-acento lg:-ml-2"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-texto lg:text-3xl">{titulo}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 lg:overflow-visible lg:rounded-2xl lg:border lg:border-borde lg:bg-superficie lg:p-5">
        {children}
      </div>
    </div>
  );
}
