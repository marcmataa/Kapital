import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaAnalisis() {
  const t = useT('analisis');
  return <PaginaEnConstruccion titulo={t('titulo')} />;
}
