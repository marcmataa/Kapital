import {
  useListarCategoriasQuery,
  useListarCuentasQuery,
  useListarObjetivosQuery,
} from '@/shared/api/catalogos';
import { useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { Button, Card, Spinner } from '@/shared/ui';
import { SeccionAparienciaCuenta } from '../components/SeccionAparienciaCuenta';
import { SeccionAtajo } from '../components/SeccionAtajo';
import { SeccionBancos } from '../components/SeccionBancos';
import { SeccionIdioma } from '../components/SeccionIdioma';
import { SeccionResumen } from '../components/SeccionResumen';

export default function PaginaConfiguracion() {
  const t = useT('configuracion');
  const tc = useT('common');
  const cuentas = useListarCuentasQuery();
  const categorias = useListarCategoriasQuery();
  const objetivos = useListarObjetivosQuery();

  const cargando = cuentas.isLoading || categorias.isLoading || objetivos.isLoading;
  const error = cuentas.isError || categorias.isError || objetivos.isError;
  const reintentar = () => {
    if (cuentas.isError) void cuentas.refetch();
    if (categorias.isError) void categorias.refetch();
    if (objetivos.isError) void objetivos.refetch();
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <CabeceraPagina titulo={t('titulo')} />
      <SeccionIdioma />
      {cargando ? (
        <Card className="flex justify-center">
          <Spinner />
        </Card>
      ) : error ? (
        <Card role="alert" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-negativo">{t('error.carga')}</p>
          <Button variante="secundario" tamano="sm" onClick={reintentar}>
            {tc('accion.reintentar')}
          </Button>
        </Card>
      ) : (
        <>
          <SeccionBancos cuentas={cuentas.data ?? []} />
          <SeccionResumen
            cuentas={cuentas.data ?? []}
            categorias={categorias.data ?? []}
            objetivos={objetivos.data ?? []}
          />
        </>
      )}
      <SeccionAtajo />
      <SeccionAparienciaCuenta />
    </div>
  );
}
