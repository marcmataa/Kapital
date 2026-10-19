import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaMovimientos() {
  const t = useT('movimientos');
  return <PaginaEnConstruccion titulo={t('titulo')} />;
}
