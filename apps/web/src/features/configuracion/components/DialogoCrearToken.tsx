import { useId, useState, type FormEvent } from 'react';
import { useDispatch } from 'react-redux';
import { Copy, TriangleAlert } from 'lucide-react';
import { api } from '@/app/api';
import type { AppDispatch } from '@/app/store';
import { useT } from '@/shared/i18n';
import { Button, Input, Sheet } from '@/shared/ui';
import { claveError } from '../api/errores';
import { crearToken } from '../api/tokens';
import { AlertaError } from './AlertaError';

interface Props {
  onCerrar: () => void;
}

/**
 * Crea un token y lo muestra UNA vez. El token vive solo en el estado de este diálogo: se
 * borra al cerrarlo y el componente se desmonta (quien lo usa lo monta solo mientras está
 * abierto). No pasa por la caché de RTK Query ni se registra en ningún log.
 */
export function DialogoCrearToken({ onCerrar }: Props) {
  const t = useT('configuracion');
  const dispatch = useDispatch<AppDispatch>();
  const idForm = useId();
  const idAviso = useId();
  const [nombre, setNombre] = useState(() => t('atajo.nombrePorDefecto'));
  const [token, setToken] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copia, setCopia] = useState<'ok' | 'error' | null>(null);

  const cerrar = () => {
    setToken(null);
    onCerrar();
  };

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const r = await crearToken(nombre.trim() === '' ? t('atajo.nombrePorDefecto') : nombre.trim());
    setCargando(false);
    if ('error' in r) {
      setError(t(claveError(r.error)));
      return;
    }
    setToken(r.token);
    dispatch(api.util.invalidateTags(['Tokens']));
  };

  const copiar = async () => {
    if (token === null) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopia('ok');
    } catch {
      setCopia('error');
    }
  };

  if (token !== null) {
    return (
      <Sheet
        abierto
        onCerrar={cerrar}
        titulo={t('atajo.tokenTitulo')}
        pie={
          <div className="flex justify-end">
            <Button onClick={cerrar}>{t('atajo.hecho')}</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p
            id={idAviso}
            className="flex items-start gap-2 rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2.5 text-sm text-aviso"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t('atajo.tokenAviso')}</span>
          </p>
          <code
            aria-label={t('atajo.tokenEtiqueta')}
            aria-describedby={idAviso}
            className="block rounded-xl border border-borde bg-superficie-2 px-3 py-3 font-mono text-sm break-all text-texto select-all"
          >
            {token}
          </code>
          <div className="flex flex-wrap items-center gap-3">
            <Button variante="secundario" icono={<Copy aria-hidden="true" className="size-4" />} onClick={() => void copiar()}>
              {t('atajo.copiar')}
            </Button>
            <span role="status" className="text-sm text-apagado">
              {copia === 'ok' ? t('atajo.copiado') : copia === 'error' ? t('atajo.copiarError') : ''}
            </span>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      abierto
      onCerrar={cerrar}
      titulo={t('atajo.crear')}
      pie={
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={cerrar}>
            {t('accion.cancelar')}
          </Button>
          <Button type="submit" form={idForm} cargando={cargando}>
            {t('atajo.generar')}
          </Button>
        </div>
      }
    >
      <form id={idForm} onSubmit={(e) => void crear(e)} noValidate className="flex flex-col gap-4">
        <Input
          label={t('atajo.nombre')}
          ayuda={t('atajo.nombreAyuda')}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={40}
          autoComplete="off"
        />
        <AlertaError mensaje={error} />
      </form>
    </Sheet>
  );
}
