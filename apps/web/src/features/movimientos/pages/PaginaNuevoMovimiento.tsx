import { useSearchParams } from 'react-router';
import { useT } from '@/shared/i18n';
import { NuevoMovimiento } from '../components/NuevoMovimiento';
import { PantallaFormulario } from '../components/PantallaFormulario';
import { useVolver } from '../hooks/useVolver';

export default function PaginaNuevoMovimiento() {
  const t = useT('movimientos');
  const [params] = useSearchParams();
  const volver = useVolver('/movimientos');
  const ajuste = params.get('tipo') === 'ajuste';
  return (
    <PantallaFormulario titulo={ajuste ? t('ajuste.titulo') : t('nuevo.titulo')} volverA="/movimientos">
      <NuevoMovimiento params={params} onTerminar={volver} />
    </PantallaFormulario>
  );
}
