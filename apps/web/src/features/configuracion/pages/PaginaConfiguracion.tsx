import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaConfiguracion() {
  const t = useT('configuracion');
  return <PaginaEnConstruccion titulo={t('titulo')} descripcion={t('descripcion')} />;
}
