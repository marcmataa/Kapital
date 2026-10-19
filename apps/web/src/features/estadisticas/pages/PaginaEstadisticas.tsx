import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaEstadisticas() {
  const t = useT('estadisticas');
  return <PaginaEnConstruccion titulo={t('titulo')} descripcion={t('descripcion')} />;
}
