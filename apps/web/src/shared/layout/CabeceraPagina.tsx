import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useT } from '@/shared/i18n';

/** Pone «<titulo> · Kapital» como título de la pestaña. */
export function useTituloDocumento(titulo: string): void {
  const t = useT('common');
  const app = t('app.nombre');
  useEffect(() => {
    document.title = titulo ? `${titulo} · ${app}` : app;
  }, [titulo, app]);
}

interface Props {
  titulo: string;
  descripcion?: ReactNode;
  /** Botones o selectores a la derecha. */
  acciones?: ReactNode;
  /** Ruta del botón «Volver». */
  volverA?: string;
  /** Título de la pestaña si debe ser distinto del h1 (por defecto, `titulo`). */
  tituloDocumento?: string;
}

/** Cabecera estándar de página: h1 + descripción + acciones. También fija document.title. */
export function CabeceraPagina({ titulo, descripcion, acciones, volverA, tituloDocumento }: Props) {
  const t = useT('common');
  useTituloDocumento(tituloDocumento ?? titulo);
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {volverA !== undefined && (
          <Link
            to={volverA}
            aria-label={t('accion.volver')}
            className="-ml-2 rounded-lg p-2 text-apagado transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-texto sm:text-3xl">{titulo}</h1>
          {descripcion !== undefined && <p className="mt-1 text-sm text-apagado">{descripcion}</p>}
        </div>
      </div>
      {/* Acciones (selector de mes, filtros…): junto al título si caben; si no, debajo, sin ocupar todo el ancho. */}
      {acciones !== undefined && (
        <div className="flex items-center gap-2 sm:justify-end">{acciones}</div>
      )}
    </header>
  );
}
