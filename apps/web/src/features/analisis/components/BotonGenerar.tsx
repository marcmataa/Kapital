import { RefreshCw, Sparkles } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';
import type { ErrorApi } from '@/app/api';
import { useAnalisisGenerarMutation } from '../api/analisisApi';
import { claveErrorAnalisis } from '../lib/errores';

interface Props {
  mes: string;
  /** primera: aún no hay análisis (no consume la regeneración). regenerar: rehacer uno existente. */
  modo: 'primera' | 'regenerar';
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

/**
 * «Generar análisis» o «Regenerar (1 disponible)». Llama a la Edge Function y traduce sus
 * códigos de error a mensajes amables (nunca el texto del proveedor ni de la base).
 */
export function BotonGenerar({ mes, modo, regeneraciones = 0, ocupado = false }: Props) {
  const t = useT('analisis');
  const [generar, { isLoading, error, reset }] = useAnalisisGenerarMutation({ fixedCacheKey: `analisis-${mes}` });
  const agotado = modo === 'regenerar' && regeneraciones >= 1;

  if (agotado) {
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <Button
          variante="secundario"
          disabled
          aria-describedby={`agotado-${mes}`}
          icono={<RefreshCw aria-hidden="true" className="size-4" />}
        >
          {t('regenerar.botonAgotado')}
        </Button>
        <p id={`agotado-${mes}`} className="text-sm text-apagado">
          {t('regenerar.agotado')}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        variante={modo === 'primera' ? 'primario' : 'secundario'}
        cargando={isLoading}
        disabled={ocupado}
        icono={modo === 'primera' ? <Sparkles aria-hidden="true" className="size-4" /> : <RefreshCw aria-hidden="true" className="size-4" />}
        onClick={() => {
          reset();
          void generar(mes);
        }}
      >
        {modo === 'primera' ? t('generar.boton') : t('regenerar.boton')}
      </Button>
      {isLoading && <p className="text-xs text-apagado" role="status">{t('generar.enCurso')}</p>}
      {error !== undefined && !isLoading && (
        <p role="alert" className="text-sm font-medium text-negativo">
          {t(claveErrorAnalisis(codigoDe(error)))}
        </p>
      )}
    </div>
  );
}
