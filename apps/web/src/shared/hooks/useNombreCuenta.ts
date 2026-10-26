import { useCallback, useMemo } from 'react';
import { useListarCuentasQuery, type Cuenta } from '@/shared/api/catalogos';
import { useT } from '@/shared/i18n';
import { nombreCuenta, type CuentaConNombre } from '@/shared/lib/cuentas';

/** `nombreDe(cuenta)`: nombre visible de una cuenta que ya trae su `clave`. */
export function useNombreCuenta(): (cuenta: CuentaConNombre) => string {
  const t = useT('common');
  return useCallback((cuenta: CuentaConNombre) => nombreCuenta(cuenta, t), [t]);
}

const SIN_CUENTAS: Cuenta[] = [];

/**
 * Para datos que traen el nombre pero no la clave (vistas SQL como v_fuera_balance o relaciones
 * que no la piden): busca la clave en el catálogo de cuentas, por id si lo hay y si no por nombre
 * (único por usuario). Si no la encuentra, se muestra el nombre tal cual.
 */
export function useNombreCuentaCatalogo(): (cuenta: { id?: string | null; nombre: string }) => string {
  const t = useT('common');
  const { data = SIN_CUENTAS } = useListarCuentasQuery();
  const { porId, porNombre } = useMemo(
    () => ({
      porId: new Map(data.map((c) => [c.id, c])),
      porNombre: new Map(data.map((c) => [c.nombre, c])),
    }),
    [data],
  );
  return useCallback(
    ({ id, nombre }: { id?: string | null; nombre: string }) => {
      const enCatalogo = (id ? porId.get(id) : undefined) ?? porNombre.get(nombre);
      const clave = enCatalogo?.nombre === nombre ? (enCatalogo.clave ?? null) : null;
      return nombreCuenta({ nombre, clave }, t);
    },
    [porId, porNombre, t],
  );
}
