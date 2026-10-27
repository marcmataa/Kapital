import { Link } from 'react-router';
import { ChevronRight, CreditCard, HandCoins, TrendingUp, Wallet } from 'lucide-react';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { enlaceMovimientos } from '@/shared/lib/enlaces';
import { BankLogo } from '@/shared/ui';
import { cuentasDelDesglose, type CuentaDesglose } from '../lib/desglose';

interface Props {
  /** Cuentas con su valor (SQL, texto) al cierre de `fecha`. */
  cuentas: readonly CuentaDesglose[];
  /** Fecha de referencia del patrimonio ('YYYY-MM-DD'). */
  fecha: string;
}

const ICONO_TIPO = {
  efectivo: Wallet,
  inversion: TrendingUp,
  pasivo: CreditCard,
  por_cobrar: HandCoins,
} as const;

/** Logo del banco; para el resto, su emoji o un icono por tipo (decorativo: el nombre va al lado). */
function IconoCuenta({ cuenta }: { cuenta: CuentaDesglose }) {
  if (cuenta.tipo === 'banco') {
    return <BankLogo entidad={cuenta.entidad} nombre={cuenta.nombre} color={cuenta.color} tamano="sm" />;
  }
  const clases = 'inline-flex size-7 shrink-0 items-center justify-center rounded-xl bg-superficie-2';
  if (cuenta.emoji) {
    return (
      <span aria-hidden="true" className={cx(clases, 'text-base leading-none')}>
        {cuenta.emoji}
      </span>
    );
  }
  const Icono = ICONO_TIPO[cuenta.tipo];
  return (
    <span aria-hidden="true" className={cx(clases, 'text-apagado')}>
      <Icono className="size-4" />
    </span>
  );
}

/**
 * Cuánto hay en cada cuenta a la fecha del patrimonio (la galería «Patrimonio total» de Notion).
 * - Móvil: filas a todo el ancho, nombre a la izquierda e importe a la derecha; siempre visibles.
 * - Escritorio, con la tarjeta en un tercio: nombre encima del importe; en pantallas anchas, en fila.
 * Los negativos (pasivos) salen con su signo y en rojo.
 */
export function DesgloseCuentas({ cuentas, fecha }: Props) {
  const t = useT('inicio');
  const nombreCuenta = useNombreCuenta();
  const { locale } = useIdioma();
  const filas = cuentasDelDesglose(cuentas, fecha);
  if (filas.length === 0) return null;

  return (
    <ul aria-label={t('kpi.cuentas')} className="mt-3 flex flex-col border-t border-borde">
      {filas.map((c) => (
        <li key={c.id} className="border-b border-borde last:border-b-0">
          {/* Cada cuenta abre sus movimientos (auditoría F08). */}
          <Link
            to={enlaceMovimientos({ cuenta: c.id })}
            title={t('kpi.verMovimientosCuenta', { cuenta: nombreCuenta(c) })}
            className="-mx-1.5 flex items-center gap-3 rounded-lg px-1.5 py-2 hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
          >
            <IconoCuenta cuenta={c} />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:gap-0 xl:flex-row xl:items-baseline xl:gap-2">
              <span className="max-w-full truncate text-sm text-apagado">{nombreCuenta(c)}</span>
              <span
                className={cx(
                  'cifras shrink-0 text-sm font-semibold',
                  aCentimos(c.valor) < 0n ? 'text-negativo' : 'text-texto',
                )}
              >
                {formatearEuros(c.valor, locale)}
              </span>
            </div>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-tenue" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
