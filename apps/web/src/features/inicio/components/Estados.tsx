import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { Button } from '@/shared/ui';

/** Bloque gris animado mientras cargan los datos (oculto a lectores de pantalla). */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-xl bg-superficie-2', className)} />;
}

/** Error de carga de una tarjeta con botón «Reintentar». */
export function ErrorCarga({ onReintentar }: { onReintentar: () => void }) {
  const t = useT('inicio');
  const tc = useT('common');
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl bg-negativo-suave p-3 text-sm text-negativo">
      <p>{t('error.cargar')}</p>
      <Button variante="secundario" tamano="sm" onClick={onReintentar}>
        {tc('accion.reintentar')}
      </Button>
    </div>
  );
}
