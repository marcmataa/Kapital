import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaDetalleMovimiento() {
  const t = useT('movimientos');
  return <PaginaEnConstruccion titulo={t('detalle.titulo')} volverA="/movimientos" />;
}
