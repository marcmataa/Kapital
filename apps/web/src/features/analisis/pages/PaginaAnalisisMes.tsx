import { useParams } from 'react-router';
import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaAnalisisMes() {
  const t = useT('analisis');
  const { mes = '' } = useParams();
  return <PaginaEnConstruccion titulo={t('detalle.titulo', { mes })} volverA="/analisis" />;
}
