import { useMemo } from 'react';
import { useT } from '@/shared/i18n';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { Button, EmptyState, PantallaCarga } from '@/shared/ui';
import type { Cuenta } from '@/shared/api/catalogos';
import { useCatalogos } from '../hooks/useCatalogos';
import { esTipo, esUuid } from '../lib/tipos';
import { cuentaPorDefecto, cuentaUsable, type ValoresMovimiento } from '../schemas/movimiento';
import { FormularioMovimiento } from './FormularioMovimiento';

/**
 * Valores iniciales. Admite `?tipo=ajuste&cuenta=<id>` (desde Configuración, para cuadrar una cuenta).
 * Valores que no encajan (tipo desconocido, cuenta cerrada o ajena) se ignoran.
 */
export function valoresIniciales(params: URLSearchParams, cuentas: readonly Cuenta[], hoy: string): ValoresMovimiento {
  const tipoParam = params.get('tipo');
  const tipo = esTipo(tipoParam) ? tipoParam : 'gasto';
  const cuentaParam = params.get('cuenta');
  const cuentaPedida = esUuid(cuentaParam) ? cuentas.find((c) => c.id === cuentaParam) : undefined;
  const metodo = tipo === 'gasto' ? 'tarjeta' : '';
  return {
    tipo,
    importe: '',
    categoria_id: '',
    cuenta_id: cuentaUsable(cuentaPedida) ? cuentaPedida.id : cuentaPorDefecto(cuentas, metodo),
    cuenta_destino_id: '',
    metodo,
    devolucion_de: '',
    sentido: 'suma',
    fecha: hoy,
    concepto: '',
    notas: '',
  };
}

interface Props {
  params: URLSearchParams;
  onTerminar: () => void;
}

/** Alta de un movimiento: en su página (móvil) o en un modal sobre la lista (escritorio). */
export function NuevoMovimiento({ params, onTerminar }: Props) {
  const t = useT('movimientos');
  const tc = useT('common');
  const catalogos = useCatalogos();
  const { hoy } = useHoyUsuario();
  const inicial = useMemo(
    () => (catalogos.cargando ? null : valoresIniciales(params, catalogos.cuentas, hoy)),
    [catalogos.cargando, catalogos.cuentas, params, hoy],
  );

  if (catalogos.cargando || inicial === null) return <PantallaCarga />;
  if (catalogos.error) {
    return (
      <EmptyState
        titulo={t('form.errorCatalogos')}
        accion={
          <Button variante="secundario" onClick={catalogos.reintentar}>
            {tc('accion.reintentar')}
          </Button>
        }
      />
    );
  }
  if (!catalogos.cuentas.some(cuentaUsable)) return <EmptyState titulo={t('form.sinCuentas')} />;
  return (
    <FormularioMovimiento
      inicial={inicial}
      cuentas={catalogos.cuentas}
      categorias={catalogos.categorias}
      hoy={hoy}
      onGuardado={onTerminar}
      onCancelar={onTerminar}
    />
  );
}
