import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n';
import { BotonTema, Logo, useTituloDocumento } from '@/shared/layout';

interface Props {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  pie?: ReactNode;
}

/** Marco común de login, registro y recuperación: tarjeta centrada con la marca. */
export function AuthLayout({ titulo, subtitulo, children, pie }: Props) {
  const t = useT('auth');
  useTituloDocumento(titulo);
  return (
    <div className="flex min-h-dvh flex-col bg-fondo px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <div className="flex justify-end">
        <BotonTema />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo />
          <p className="text-sm text-apagado">{t('marca.lema')}</p>
        </div>
        <section className="rounded-2xl border border-borde bg-superficie p-6 shadow-tarjeta sm:p-8">
          <h1 className="text-xl font-semibold text-texto">{titulo}</h1>
          {subtitulo !== undefined && <p className="mt-1 text-sm text-apagado">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </section>
        {pie !== undefined && <div className="text-center text-sm text-apagado">{pie}</div>}
      </main>
    </div>
  );
}
