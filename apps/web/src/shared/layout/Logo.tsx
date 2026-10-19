import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

/**
 * Marca: la «K» del logo de Kapital (public/brand/kapital-marca-96.png, recorte de
 * public/brand/kapital-icono.png) + la palabra «Kapital». Sin recursos externos.
 */
export function Logo({ className, conTexto = true }: { className?: string; conTexto?: boolean }) {
  const t = useT('common');
  return (
    <span className={cx('inline-flex items-center gap-2.5 font-semibold text-texto', className)}>
      <img
        src="/brand/kapital-marca-96.png"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className="size-8 rounded-lg ring-1 ring-borde"
      />
      {conTexto && <span className="text-lg tracking-tight">{t('app.nombre')}</span>}
    </span>
  );
}
