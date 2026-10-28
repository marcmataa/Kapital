import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

/** Bloque gris que ocupa el sitio de un contenido mientras carga (decorativo). */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('motion-safe:animate-pulse rounded-xl bg-superficie-2', className)} />;
}

/**
 * Carga de una página (al navegar a una ruta que aún no se ha descargado): la forma de la página
 * (título y tarjetas) en lugar de un spinner solo en el centro, para que la estructura aparezca
 * antes que los datos (auditoría F18). Un único `status` anuncia «Cargando…».
 */
export function EsqueletoPagina() {
  const t = useT('common');
  return (
    <div role="status" data-testid="esqueleto-pagina" className="flex flex-col gap-4 sm:gap-5">
      <span className="sr-only">{t('estado.cargando')}</span>
      <Esqueleto className="h-9 w-48" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Esqueleto className="h-40" />
        <Esqueleto className="hidden h-40 lg:block" />
      </div>
      <Esqueleto className="h-64" />
    </div>
  );
}

/** Una tarjeta cargando: su cabecera y su cuerpo, con la altura aproximada del contenido. */
export function EsqueletoTarjeta({ alto = 'h-48' }: { alto?: string }) {
  const t = useT('common');
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
      <span className="sr-only">{t('estado.cargando')}</span>
      <Esqueleto className="h-5 w-40" />
      <Esqueleto className={alto} />
    </div>
  );
}
