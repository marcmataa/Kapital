import { useT } from '@/shared/i18n';
import { PaginaEnConstruccion } from '@/shared/layout';

export default function PaginaNuevoMovimiento() {
  const t = useT('movimientos');
  return <PaginaEnConstruccion titulo={t('nuevo.titulo')} volverA="/movimientos" />;
}
