import { RefreshCw, Sparkles } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';
import type { ErrorApi } from '@/app/api';
import { useAnalisisGenerarMutation } from '../api/analisisApi';
import { claveErrorAnalisis } from '../lib/errores';

interface Props {
  mes: string;
  /**
   * primera: aún no hay análisis. reintentar: falló o se quedó atascado. Ninguna de las dos
   * consume la regeneración. regenerar: rehacer uno listo (máx. 1).
   */
  modo: 'primera' | 'reintentar' | 'regenerar';
  /** Regeneraciones ya usadas (máx. 1). */
  regeneraciones?: number;
  /** Desactivado mientras el análisis se está generando. */
  ocupado?: boolean;
}

function codigoDe(error: unknown): string {
  return typeof error === 'object' && error !== null && typeof (error as Partial<ErrorApi>).codigo === 'string'
    ? ((error as ErrorApi).codigo)
    : 'desconocido';
}

const ETIQUETA = {
  primera: 'generar.boton',
  reintentar: 'reintentar.boton',
  regenerar: 'regenerar.boton',
} as const;

/**
 * «Generar análisis», «Reintentar» o «Regenerar (1 disponible)». Llama a la Edge Function (que
 * decide según el estado de la fila) y traduce sus códigos de error a mensajes amables (nunca el
 * texto del proveedor ni de la base).
 */
export function BotonGenerar({ mes, modo, regeneraciones = 0, ocupado = false }: Props) {
  const t = useT('analisis');
  const [generar, { isLoading, error, reset }] = useAnalisisGenerarMutation({ fixedCacheKey: `analisis-${mes}` });
  const agotado = modo === 'regenerar' && regeneraciones >= 1;

  // Sin regeneraciones: un texto, no un botón deshabilitado con el peso visual de una acción
  // (auditoría F26). La regeneración es una por análisis y no se recupera (solicitar_regeneracion).
  if (agotado) {
    return (
      <p data-testid="regeneracion-agotada" className="flex items-center gap-1.5 text-sm text-apagado">
        <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
        {t('regenerar.agotado')}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        variante={modo === 'primera' ? 'primario' : 'secundario'}
        cargando={isLoading}
        disabled={ocupado}
        icono={
          modo === 'primera' ? (
            <Sparkles aria-hidden="true" className="size-4" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )
        }
        onClick={() => {
          reset();
          void generar(mes);
        }}
      >
        {t(ETIQUETA[modo])}
      </Button>
      {modo === 'reintentar' && !isLoading && <p className="text-xs text-apagado">{t('reintentar.noConsume')}</p>}
      {isLoading && <p className="text-xs text-apagado" role="status">{t('generar.enCurso')}</p>}
      {error !== undefined && !isLoading && (
        <p role="alert" className="text-sm font-medium text-negativo">
          {t(claveErrorAnalisis(codigoDe(error)))}
        </p>
      )}
    </div>
  );
}
