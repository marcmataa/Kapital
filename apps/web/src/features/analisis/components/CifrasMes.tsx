import type { ReactNode } from 'react';
import { useT } from '@/shared/i18n';
import { lecturaAhorro } from '@/shared/lib/ahorro';
import { aCentimos, formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { useLocale } from '../hooks/useLocale';
import type { DatosAnalisis } from '../schemas/esquemas';

function tonoDe(valor: string): string {
  const c = aCentimos(valor);
  return c < 0n ? 'text-negativo' : c > 0n ? 'text-positivo' : 'text-texto';
}

function Cifra({
  titulo,
  valor,
  clase,
  nota,
  esTexto = false,
  children,
}: {
  titulo: string;
  valor: string;
  clase: string;
  esTexto?: boolean;
  /** Aclaración aparte, en su propio párrafo y más pequeña (auditoría F20). */
  nota?: string | undefined;
  children: ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-borde bg-superficie p-4 shadow-tarjeta sm:p-5">
      <h3 className="text-sm text-apagado">{titulo}</h3>
      <p
        className={cx(
          // Un texto en lugar de una cifra (p. ej. ahorro no calculable): más pequeño y en varias líneas.
          esTexto ? 'text-base font-semibold' : 'cifras truncate text-2xl font-bold tracking-tight sm:text-[1.75rem]',
          clase,
        )}
      >
        {valor}
      </p>
      <p className="text-xs text-apagado sm:text-sm">{children}</p>
      {nota !== undefined && <p className="text-xs text-tenue">{nota}</p>}
    </article>
  );
}

/**
 * Tres medidas que nunca se mezclan (reglas, secciones 3 y 5): balance del mes, ahorro y
 * variación patrimonial, cada una en su tarjeta. Todas salen del snapshot `datos`.
 */
export function CifrasMes({ datos }: { datos: DatosAnalisis }) {
  const t = useT('analisis');
  const tc = useT('common');
  const locale = useLocale();
  const { resumen, variacion } = datos;
  const euros = (v: string) => formatearEuros(v, locale);
  const conSigno = (v: string) => formatearEuros(v, locale, { signo: 'siempre' });
  const saldos = aCentimos(variacion.saldos_iniciales) !== 0n;
  const desplazadas = aCentimos(variacion.devoluciones_desplazadas) !== 0n;
  const ahorro = lecturaAhorro(resumen.ingresos, resumen.ahorro_pct);

  return (
    <section aria-label={t('cifras.titulo')} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Cifra titulo={t('cifras.balance')} valor={conSigno(resumen.balance)} clase={tonoDe(resumen.balance)}>
        {t('cifras.balanceDetalle', { ingresos: euros(resumen.ingresos), gastos: euros(resumen.gastos_netos) })}
      </Cifra>
      {/* La tasa solo entre −100 % y 100 % (sección 3, cambio del 02/11/2026); si no, un texto en su lugar. */}
      {ahorro.tipo === 'fueraDeRango' ? (
        <Cifra titulo={t('cifras.ahorro')} valor={tc('ahorro.fueraDeRangoCerrado')} clase="text-texto" esTexto>
          {t('cifras.ahorroDetalle')}
        </Cifra>
      ) : (
        <Cifra
          titulo={t('cifras.ahorro')}
          valor={formatearPorcentaje(ahorro.tipo === 'porcentaje' ? ahorro.porcentaje : null, locale)}
          clase="text-texto"
        >
          {ahorro.tipo === 'sinIngresos' ? tc('ahorro.sinIngresos') : t('cifras.ahorroDetalle')}
        </Cifra>
      )}
      <Cifra
        titulo={t('cifras.variacion')}
        valor={conSigno(variacion.variacion)}
        clase={tonoDe(variacion.variacion)}
        nota={saldos ? t('cifras.variacionSaldos', { saldos: euros(variacion.saldos_iniciales) }) : undefined}
      >
        {/* La pieza de devoluciones desplazadas solo se muestra si no es 0 (sección 5). */}
        {t(desplazadas ? 'cifras.variacionDetalleDesplazadas' : 'cifras.variacionDetalle', {
          balance: euros(variacion.balance),
          desplazadas: euros(variacion.devoluciones_desplazadas),
          revalorizacion: euros(variacion.revalorizacion),
          ajustes: euros(variacion.ajustes),
        })}
      </Cifra>
    </section>
  );
}
