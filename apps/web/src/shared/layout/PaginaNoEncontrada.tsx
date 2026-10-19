import { Link } from 'react-router';
import { useT } from '@/shared/i18n';
import { clasesBoton, EmptyState } from '@/shared/ui';
import { useTituloDocumento } from './CabeceraPagina';

export function PaginaNoEncontrada() {
  const t = useT('common');
  useTituloDocumento(t('error.noEncontradoTitulo'));
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-texto">{t('error.noEncontradoTitulo')}</h1>
        <EmptyState
          titulo={t('error.noEncontradoTexto')}
          accion={
            <Link to="/" className={clasesBoton('primario')}>
              {t('error.irInicio')}
            </Link>
          }
        />
      </div>
    </main>
  );
}
