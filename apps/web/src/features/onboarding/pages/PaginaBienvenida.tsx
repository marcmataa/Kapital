import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaBienvenida() {
  const t = useT('onboarding');
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-10">
      <PaginaEnConstruccion titulo={t('titulo')} descripcion={t('descripcion')} />
    </main>
  );
}
