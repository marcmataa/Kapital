import { useState } from 'react';
import toast from 'react-hot-toast';
import { useUsuario } from '@/app/auth';
import { useCerrarSesion } from '@/shared/hooks/useCerrarSesion';
import { useT } from '@/shared/i18n';
import { Button, Input, Sheet } from '@/shared/ui';
import { confirmacionValida, eliminarCuenta, type ResultadoEliminar } from '../api/eliminarCuenta';
import { AlertaError } from './AlertaError';

type CodigoError = Exclude<ResultadoEliminar, { ok: true }>['codigo'];

const MENSAJE: Record<CodigoError, 'eliminar.errorReautenticar' | 'eliminar.errorConfirmacion' | 'eliminar.errorSesion' | 'error.red' | 'error.generico'> = {
  reautenticacion_requerida: 'eliminar.errorReautenticar',
  confirmacion_invalida: 'eliminar.errorConfirmacion',
  no_autenticado: 'eliminar.errorSesion',
  red: 'error.red',
  generico: 'error.generico',
};

/**
 * Eliminar la cuenta, con doble confirmación: 1) aviso de lo que se borra; 2) escribir el email
 * de la cuenta. El borrado lo hace la Edge Function `eliminar-cuenta` (verifica el JWT, el email
 * y que el inicio de sesión sea reciente). Si pide reautenticación, se ofrece volver a entrar.
 */
export function DialogoEliminarCuenta({ onCerrar }: { onCerrar: () => void }) {
  const t = useT('configuracion');
  const usuario = useUsuario();
  const { salir, saliendo } = useCerrarSesion();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [escrito, setEscrito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<CodigoError | null>(null);

  const valido = confirmacionValida(escrito, usuario.email);

  const eliminar = async () => {
    if (!valido) return;
    setError(null);
    setEnviando(true);
    const r = await eliminarCuenta(escrito);
    setEnviando(false);
    if (r.ok) {
      toast.success(t('eliminar.hecho'));
      await salir();
      return;
    }
    setError(r.codigo);
  };

  const pie =
    paso === 1 ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variante="secundario" onClick={onCerrar}>
          {t('accion.cancelar')}
        </Button>
        <Button variante="peligro" onClick={() => setPaso(2)}>
          {t('eliminar.continuar')}
        </Button>
      </div>
    ) : (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variante="secundario" onClick={onCerrar}>
          {t('accion.cancelar')}
        </Button>
        {error === 'reautenticacion_requerida' || error === 'no_autenticado' ? (
          <Button variante="secundario" cargando={saliendo} onClick={() => void salir()}>
            {t('eliminar.volverAEntrar')}
          </Button>
        ) : null}
        <Button variante="peligro" cargando={enviando} disabled={!valido} onClick={() => void eliminar()}>
          {t('eliminar.definitivo')}
        </Button>
      </div>
    );

  return (
    <Sheet abierto onCerrar={onCerrar} titulo={t('eliminar.titulo')} pie={pie}>
      {paso === 1 ? (
        <div className="flex flex-col gap-3 text-sm text-texto">
          <p>{t('eliminar.aviso')}</p>
          <p className="text-apagado">{t('eliminar.consejo')}</p>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void eliminar();
          }}
        >
          <p className="text-sm text-texto">{t('eliminar.escribeEmail', { email: usuario.email ?? '' })}</p>
          <Input
            label={t('eliminar.campoEmail')}
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={escrito}
            onChange={(e) => {
              setEscrito(e.target.value);
              setError(null);
            }}
          />
          <p className="text-xs text-apagado">{t('eliminar.reautenticacion')}</p>
          <AlertaError mensaje={error === null ? null : t(MENSAJE[error])} />
        </form>
      )}
    </Sheet>
  );
}
