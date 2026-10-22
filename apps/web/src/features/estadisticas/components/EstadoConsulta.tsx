import type { ReactNode } from 'react';
import { Button, Card, Spinner } from '@/shared/ui';
import { useT } from '@/shared/i18n';
import type { ErrorApi } from '@/app/api';

interface Props<T> {
  datos: T | undefined;
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
  children: (datos: T) => ReactNode;
}

function esErrorRed(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as Partial<ErrorApi>).codigo === 'red';
}

/** Pinta los datos de una consulta, o un spinner, o un error genérico con «Reintentar». */
export function EstadoConsulta<T>({ datos, cargando, error, reintentar, children }: Props<T>) {
  const tc = useT('common');
  if (datos !== undefined) return <>{children(datos)}</>;
  if (error !== undefined && !cargando) {
    return (
      <Card>
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-texto">
          <span>{esErrorRed(error) ? tc('error.red') : tc('error.generico')}</span>
          <Button variante="secundario" tamano="sm" onClick={reintentar}>
            {tc('accion.reintentar')}
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    </Card>
  );
}
