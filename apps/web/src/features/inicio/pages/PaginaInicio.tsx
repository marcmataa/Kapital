import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaInicio() {
  const t = useT('inicio');
  return <PaginaEnConstruccion titulo={t('titulo')} descripcion={t('descripcion')} />;
}
