import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { hoy as hoyEn } from '@/shared/lib/fechas';
import { Button, Card, EmptyState, PantallaCarga } from '@/shared/ui';
import type { Cuenta } from '@/shared/api/catalogos';
import { FormularioMovimiento } from '../components/FormularioMovimiento';
import { useCatalogos } from '../hooks/useCatalogos';
import { useVolver } from '../hooks/useVolver';
import { esTipo, esUuid } from '../lib/tipos';
import { cuentaPorDefecto, cuentaUsable, type ValoresMovimiento } from '../schemas/movimiento';

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

export default function PaginaNuevoMovimiento() {
  const t = useT('movimientos');
  const tc = useT('common');
  const [params] = useSearchParams();
  const catalogos = useCatalogos();
  const volver = useVolver('/movimientos');
  const hoy = useMemo(() => hoyEn(), []);
  const inicial = useMemo(
    () => (catalogos.cargando ? null : valoresIniciales(params, catalogos.cuentas, hoy)),
    [catalogos.cargando, catalogos.cuentas, params, hoy],
  );

  let contenido;
  if (catalogos.cargando || inicial === null) {
    contenido = <PantallaCarga />;
  } else if (catalogos.error) {
    contenido = (
      <EmptyState
        titulo={t('form.errorCatalogos')}
        accion={
          <Button variante="secundario" onClick={catalogos.reintentar}>
            {tc('accion.reintentar')}
          </Button>
        }
      />
    );
  } else if (!catalogos.cuentas.some(cuentaUsable)) {
    contenido = <EmptyState titulo={t('form.sinCuentas')} />;
  } else {
    contenido = (
      <FormularioMovimiento
        inicial={inicial}
        cuentas={catalogos.cuentas}
        categorias={catalogos.categorias}
        hoy={hoy}
        onGuardado={volver}
        onCancelar={volver}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <CabeceraPagina titulo={t('nuevo.titulo')} volverA="/movimientos" />
      <Card>{contenido}</Card>
    </div>
  );
}
