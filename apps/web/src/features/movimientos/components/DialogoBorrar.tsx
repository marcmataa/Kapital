import { useState } from 'react';
import toast from 'react-hot-toast';
import { useIdioma, useT } from '@/shared/i18n';
import { Button, Sheet } from '@/shared/ui';
import { formatearEuros } from '@/shared/lib/dinero';
import { useMovimientosBorrarMutation, useMovimientosDevolucionesDeQuery } from '../api/movimientosApi';
import { claveErrorMovimiento } from '../api/errores';
import { importeConSigno } from '../lib/presentacion';
import type { Movimiento } from '../lib/tipos';

interface Props {
  movimiento: Movimiento;
  abierto: boolean;
  onCerrar: () => void;
  onBorrado: () => void;
}

/**
 * Confirmación antes de borrar. El borrado lo hace la base (RLS + proteger_cuenta_cerrada). Un
 * gasto con devoluciones vinculadas no se borra (proteger_gasto_con_devoluciones, sección 3):
 * se avisa de cuántas tiene y cuánto suman, y no se ofrece el botón.
 */
export function DialogoBorrar({ movimiento: m, abierto, onCerrar, onBorrado }: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const [borrar, { isLoading }] = useMovimientosBorrarMutation();
  const [error, setError] = useState<string | null>(null);
  const devoluciones = useMovimientosDevolucionesDeQuery(m.id, { skip: !abierto || m.tipo !== 'gasto' });
  const conDevoluciones = m.tipo === 'gasto' && devoluciones.data !== undefined && devoluciones.data.n > 0 ? devoluciones.data : null;

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
          {conDevoluciones === null && (
            <Button variante="peligro" cargando={isLoading} onClick={() => void confirmar()}>
              {t('borrar.confirmar')}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-texto">
        <p>{t('borrar.texto', { concepto: m.concepto, importe: importeConSigno(m, locale) })}</p>
        {conDevoluciones !== null && (
          <p role="alert" className="rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2 text-aviso">
            {conDevoluciones.n === 1
              ? t('borrar.gastoConDevolucion', { total: formatearEuros(conDevoluciones.total, locale) })
              : t('borrar.gastoConDevoluciones', { n: conDevoluciones.n, total: formatearEuros(conDevoluciones.total, locale) })}
          </p>
        )}
        {error !== null && (
          <p role="alert" className="rounded-xl bg-negativo-suave px-3 py-2 font-medium text-negativo">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
