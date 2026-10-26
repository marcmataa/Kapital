import type { ReactNode } from 'react';
import { ChartColumn, Landmark, Zap, type LucideIcon } from 'lucide-react';
import { useT, type ClaveDe } from '@/shared/i18n';
import { Logo, SelectorIdiomaCompacto, SelectorTema, useTituloDocumento } from '@/shared/layout';

interface Props {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  pie?: ReactNode;
}

const BENEFICIOS: readonly { Icono: LucideIcon; titulo: ClaveDe<'auth'>; texto: ClaveDe<'auth'> }[] = [
  { Icono: ChartColumn, titulo: 'panel.balance.titulo', texto: 'panel.balance.texto' },
  { Icono: Landmark, titulo: 'panel.patrimonio.titulo', texto: 'panel.patrimonio.texto' },
  { Icono: Zap, titulo: 'panel.atajo.titulo', texto: 'panel.atajo.texto' },
];

/** Propuesta de valor (solo escritorio): tres beneficios, sin imágenes externas. */
function PanelValor() {
  const t = useT('auth');
  return (
    <aside
      aria-label={t('panel.region')}
      className="hidden flex-col justify-center gap-8 border-r border-borde bg-nav px-12 py-10 lg:flex"
    >
      <Logo />
      <p className="max-w-md text-3xl font-semibold tracking-tight text-texto">{t('panel.titulo')}</p>
      <ul className="flex max-w-md flex-col gap-6">
        {BENEFICIOS.map(({ Icono, titulo, texto }) => (
          <li key={titulo} className="flex gap-4">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-acento-suave text-acento">
              <Icono className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-texto">{t(titulo)}</span>
              <span className="mt-0.5 block text-sm text-apagado">{t(texto)}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Marco común de login, registro y recuperación: tarjeta centrada con la marca, selector de idioma
 * y de tema arriba y, en escritorio, un panel lateral con la propuesta de valor.
 */
export function AuthLayout({ titulo, subtitulo, children, pie }: Props) {
  const t = useT('auth');
  useTituloDocumento(titulo);
  return (
    <div className="min-h-dvh bg-fondo lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <PanelValor />
      <div className="flex min-h-dvh flex-col px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SelectorIdiomaCompacto />
          <SelectorTema compacto />
        </div>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-6">
          <div className="flex flex-col items-center gap-2 text-center lg:hidden">
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
    </div>
  );
}

/** Separador «o» entre «Continuar con Google» y el formulario: visible, no un hilo gris. */
export function SeparadorO({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 text-sm font-medium text-apagado" aria-hidden="true">
      <span className="h-px flex-1 bg-borde-fuerte" />
      <span className="rounded-full border border-borde-fuerte bg-superficie-2 px-3 py-0.5 uppercase">{texto}</span>
      <span className="h-px flex-1 bg-borde-fuerte" />
    </div>
  );
}
