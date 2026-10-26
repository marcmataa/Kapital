import { useEffect, useRef } from 'react';
import { AjusteSaldoReal } from '@/features/movimientos/components/AjusteSaldoReal';
import type { Cuenta } from '@/shared/api/catalogos';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useT } from '@/shared/i18n';
import { Sheet } from '@/shared/ui';
import { CLASE_TIRADOR } from './hoja';

interface Props {
  cuenta: Cuenta;
  /** Todas las cuentas: el formulario deja cambiar a otra que se pueda ajustar. */
  cuentas: readonly Cuenta[];
  onCerrar: () => void;
}

/**
 * «¿No cuadra? Hacer un ajuste» de un banco o del efectivo, sin salir de Configuración: el mismo
 * ajuste por saldo real que el formulario de movimientos («¿Cuánto tienes ahora en BBVA?»). La
 * diferencia la calcula la base y se enseña antes de guardar; si cuadra, no se crea nada.
 */
export function SheetAjuste({ cuenta, cuentas, onCerrar }: Props) {
  const t = useT('configuracion');
  const nombreCuenta = useNombreCuenta();
  const contenido = useRef<HTMLDivElement>(null);
  // Sheet enfoca su primer control (el botón de cerrar) al abrirse; este efecto corre después
  // y deja el foco en el saldo real, con el teclado decimal ya abierto en el móvil.
  useEffect(() => {
    contenido.current?.querySelector<HTMLInputElement>('input[inputmode="decimal"]')?.focus();
  }, []);
  return (
    <Sheet abierto onCerrar={onCerrar} titulo={t('ajuste.titulo', { nombre: nombreCuenta(cuenta) })} className={CLASE_TIRADOR}>
      <div ref={contenido}>
        <AjusteSaldoReal cuentas={cuentas} cuentaInicial={cuenta.id} onGuardado={onCerrar} onCancelar={onCerrar} />
      </div>
    </Sheet>
  );
}
