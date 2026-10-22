import { useState } from 'react';
import { Link } from 'react-router';
import toast from 'react-hot-toast';
import type { Cuenta } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { compararImportes, formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { Badge, BankLogo, Button, Sheet, clasesBoton } from '@/shared/ui';
import { useConfigCerrarBancoMutation, useConfigHacerPrincipalMutation } from '../api/configuracionApi';
import { claveError } from '../api/errores';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { AlertaError } from './AlertaError';
import { rutaAjuste } from './rutas';

interface Props {
  cuenta: Cuenta;
  /** Número de bancos abiertos (incluido este). */
  abiertos: number;
  onCerrar: () => void;
}

/** true solo si el valor de hoy es exactamente 0 (comparando strings, sin float). */
export function valeCero(valor: string | null): boolean {
  return valor !== null && compararImportes(valor, '0') === 0;
}

/** Detalle de un banco abierto: hacerlo principal o cerrarlo (solo con saldo 0). */
export function SheetBanco({ cuenta, abiertos, onCerrar }: Props) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const { hoy } = useHoyUsuario();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hacerPrincipal, estadoPrincipal] = useConfigHacerPrincipalMutation();
  const [cerrar, estadoCierre] = useConfigCerrarBancoMutation();

  const esPrincipal = cuenta.es_principal;
  const cero = valeCero(cuenta.valor);
  // El principal solo se cierra si es el único banco abierto (si no, el atajo se queda sin principal).
  const bloqueadoPorPrincipal = esPrincipal && abiertos > 1;
  const sePuedeCerrar = cero && !bloqueadoPorPrincipal;

  const marcarPrincipal = async () => {
    setError(null);
    try {
      await hacerPrincipal(cuenta.id).unwrap();
      toast.success(t('bancos.principalHecho', { nombre: cuenta.nombre }));
      onCerrar();
    } catch (e) {
      setError(t(claveError(e, {}) === 'error.red' ? 'error.red' : 'bancos.principalError'));
    }
  };

  const confirmarCierre = async () => {
    setError(null);
    try {
      await cerrar({ id: cuenta.id, fecha: hoy }).unwrap();
      toast.success(t('bancos.cerradoHecho', { nombre: cuenta.nombre }));
      onCerrar();
    } catch (e) {
      setError(t(claveError(e, { '23514': 'bancos.cerrarError' })));
    }
  };

  return (
    <Sheet abierto onCerrar={onCerrar} titulo={cuenta.nombre}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <BankLogo entidad={cuenta.entidad} nombre={cuenta.nombre} color={cuenta.color} tamano="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-apagado">{t('bancos.valorHoy')}</p>
            <p className="text-2xl font-semibold text-texto tabular-nums">
              {cuenta.valor === null ? t('bancos.sinValor') : formatearEuros(cuenta.valor, locale)}
            </p>
            <p className="text-sm text-apagado">
              {t('bancos.desde', { fecha: formatearFecha(cuenta.fecha_inicial, locale, 'corta') })}
            </p>
          </div>
        </div>

        <section className="flex flex-col gap-2 border-t border-borde pt-4">
          {esPrincipal ? (
            <p className="flex items-center gap-2 text-sm text-texto">
              <Badge tono="acento">{t('bancos.principal')}</Badge>
              {t('bancos.esPrincipal')}
            </p>
          ) : (
            <>
              <Button
                variante="secundario"
                onClick={() => void marcarPrincipal()}
                cargando={estadoPrincipal.isLoading}
                className="self-start"
              >
                {t('bancos.hacerPrincipal')}
              </Button>
              <p className="text-xs text-apagado">{t('bancos.hacerPrincipalAyuda')}</p>
            </>
          )}
        </section>

        <section className="flex flex-col gap-2 border-t border-borde pt-4">
          {confirmando ? (
            <>
              <p className="text-sm text-texto">{t('bancos.cerrarConfirmar', { nombre: cuenta.nombre })}</p>
              <div className="flex flex-wrap gap-2">
                <Button variante="peligro" onClick={() => void confirmarCierre()} cargando={estadoCierre.isLoading}>
                  {t('bancos.cerrarSi')}
                </Button>
                <Button variante="secundario" onClick={() => setConfirmando(false)}>
                  {t('accion.cancelar')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variante="secundario"
                className="self-start"
                disabled={!sePuedeCerrar}
                aria-describedby={`cierre-${cuenta.id}`}
                onClick={() => setConfirmando(true)}
              >
                {t('bancos.cerrar')}
              </Button>
              <p id={`cierre-${cuenta.id}`} className="text-xs text-apagado">
                {bloqueadoPorPrincipal
                  ? t('bancos.cerrarPrincipal')
                  : cero
                    ? t('bancos.cerrarAyuda')
                    : t('bancos.cerrarNoCero')}
              </p>
              {!cero && (
                <Link to={rutaAjuste(cuenta.id)} className={clasesBoton('fantasma', 'sm') + ' self-start text-enlace'}>
                  {t('bancos.hacerAjuste')}
                </Link>
              )}
            </>
          )}
        </section>

        <AlertaError mensaje={error} />
      </div>
    </Sheet>
  );
}
