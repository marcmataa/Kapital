import { useEffect, useState } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { guardarLocal, leerLocal } from '@/shared/lib/almacenamiento';
import { cx } from '@/shared/lib/cx';
import { Button } from '@/shared/ui';

/** Si existe, el usuario ya descartó el banner en este dispositivo. */
export const CLAVE_BANNER_INSTALAR = 'kapital.instalar.descartado';

/** Evento `beforeinstallprompt` de Chrome/Android (no está en lib.dom). */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Plataforma = 'ios' | 'android' | null;

function coincide(consulta: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches;
  } catch {
    return false;
  }
}

/** ¿Ya se abre como app instalada? Entonces no hay nada que ofrecer. */
export function esAppInstalada(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || coincide('(display-mode: standalone)');
}

/** iPhone / iPad con Safari (los otros navegadores de iOS no pueden añadir a inicio igual). */
export function esSafariIos(ua: string = navigator.userAgent): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * «Añade Kapital a la pantalla de inicio», solo en el móvil, la primera vez y hasta que se
 * descarta (recordado en localStorage; si no hay almacenamiento, vuelve a salir otra vez).
 * - iOS Safari: instrucciones (Compartir → Añadir a pantalla de inicio): no hay API para instalar.
 * - Android / Chrome: botón «Instalar» con el evento `beforeinstallprompt`.
 * - Ya instalada o escritorio: no se muestra.
 */
export function BannerInstalar({ className }: { className?: string }) {
  const t = useT('common');
  const [descartado, setDescartado] = useState(() => leerLocal(CLAVE_BANNER_INSTALAR) !== null);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [ios] = useState(() => !esAppInstalada() && esSafariIos());

  useEffect(() => {
    if (descartado) return;
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const alInstalar = () => setEvento(null);
    window.addEventListener('beforeinstallprompt', alOfrecer);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, [descartado]);

  const plataforma: Plataforma = ios ? 'ios' : evento !== null ? 'android' : null;
  if (descartado || plataforma === null) return null;

  const descartar = () => {
    guardarLocal(CLAVE_BANNER_INSTALAR, '1');
    setDescartado(true);
  };

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setEvento(null);
    if (outcome === 'accepted') descartar();
  };

  return (
    <section
      aria-label={t('instalar.region')}
      className={cx('mb-4 flex items-start gap-3 rounded-2xl border border-acento-borde bg-acento-suave p-3.5', className)}
    >
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-superficie text-acento">
        {plataforma === 'ios' ? <Share className="size-5" /> : <Smartphone className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-texto">{t('instalar.titulo')}</h2>
        <p className="mt-0.5 text-sm text-apagado">{t(plataforma === 'ios' ? 'instalar.ios' : 'instalar.android')}</p>
        {plataforma === 'android' && (
          <Button tamano="sm" className="mt-2" onClick={() => void instalar()}>
            {t('instalar.boton')}
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={descartar}
        aria-label={t('instalar.descartar')}
        title={t('instalar.descartar')}
        className="-m-1 rounded-lg p-1.5 text-apagado transition-colors hover:text-texto"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </section>
  );
}
