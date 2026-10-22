import { useState } from 'react';
import toast from 'react-hot-toast';
import { useIdioma, useT } from '@/shared/i18n';
import { Button, Sheet } from '@/shared/ui';
import { useMovimientosBorrarMutation } from '../api/movimientosApi';
import { claveErrorMovimiento } from '../api/errores';
import { importeConSigno } from '../lib/presentacion';
import type { Movimiento } from '../lib/tipos';

interface Props {
  movimiento: Movimiento;
  abierto: boolean;
  onCerrar: () => void;
  onBorrado: () => void;
}

/** Confirmación antes de borrar. El borrado lo hace la base (RLS + proteger_cuenta_cerrada). */
export function DialogoBorrar({ movimiento: m, abierto, onCerrar, onBorrado }: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const [borrar, { isLoading }] = useMovimientosBorrarMutation();
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    setError(null);
    const r = await borrar(m.id);
    if ('error' in r) {
      setError(t(claveErrorMovimiento(r.error)));
      return;
    }
    toast.success(t('borrar.exito'));
    onBorrado();
  };

  const cerrar = () => {
    setError(null);
    onCerrar();
  };

  return (
    <Sheet
      abierto={abierto}
      onCerrar={cerrar}
      titulo={t('borrar.titulo')}
      pie={
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={cerrar}>
            {t('borrar.cancelar')}
          </Button>
          <Button variante="peligro" cargando={isLoading} onClick={() => void confirmar()}>
            {t('borrar.confirmar')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-texto">
        <p>{t('borrar.texto', { concepto: m.concepto, importe: importeConSigno(m, locale) })}</p>
        {m.tipo === 'gasto' && <p className="text-apagado">{t('borrar.textoGasto')}</p>}
        {error !== null && (
          <p role="alert" className="rounded-xl bg-negativo-suave px-3 py-2 font-medium text-negativo">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
