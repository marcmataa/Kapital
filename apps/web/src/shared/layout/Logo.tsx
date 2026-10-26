import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

/**
 * Marca: la «K» del logo de Kapital (public/brand/kapital-marca-96.png, recorte con fondo
 * transparente de public/brand/kapital-icono.png) + el logotipo «KΛPITΛL» de
 * public/brand/kapital-logo-oscuro.png (mayúsculas espaciadas, la A como «Λ»). Sirve en los dos
 * temas. Los lectores de pantalla leen «Kapital».
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
        className="size-8"
        draggable={false}
      />
      {conTexto && (
        <>
          <span aria-hidden="true" className="text-base font-medium tracking-[0.32em]">
            KΛPITΛL
          </span>
          <span className="sr-only">{t('app.nombre')}</span>
        </>
      )}
    </span>
  );
}
