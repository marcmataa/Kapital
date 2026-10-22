import { Settings } from 'lucide-react';
import { useT } from '@/shared/i18n';

/** Se muestra si faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Solo nombra las variables, nunca valores. */
export function PantallaConfigFaltante({ faltan }: { faltan: string[] }) {
  const t = useT('common');
  return (
    <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-aviso-borde bg-aviso-suave text-aviso">
        <Settings aria-hidden="true" className="size-6" />
      </div>
      <h1 className="text-xl font-semibold text-texto">{t('config.faltaTitulo')}</h1>
      <p className="max-w-md text-sm text-apagado">{t('config.faltaTexto', { variables: faltan.join(', ') })}</p>
    </main>
  );
}
