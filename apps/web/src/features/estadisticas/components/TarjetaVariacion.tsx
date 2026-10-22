import { Card } from '@/shared/ui';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import type { VariacionPatrimonial } from '../api/estadisticasApi';
import { nombreMes, signo } from '../lib/formato';

interface Props {
  /** Mes cerrado (día 1). */
  mes: string;
  variacion: VariacionPatrimonial;
}

/**
 * Variación patrimonial de un mes cerrado (sección 5), separada del balance:
 * balance + traspasos (0) + revalorización + ajustes (+ saldos iniciales de cuentas abiertas en el mes).
 */
export function TarjetaVariacion({ mes, variacion }: Props) {
  const t = useT('estadisticas');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const euros = (v: string) => formatearEuros(v, locale, { signo: 'siempre' });
  const total = signo(variacion.variacion);
  const filas: { clave: string; etiqueta: string; valor: string; nota?: string }[] = [
    { clave: 'balance', etiqueta: t('variacion.balance'), valor: variacion.balance },
    { clave: 'traspasos', etiqueta: t('variacion.traspasos'), valor: '0.00' },
    { clave: 'revalorizacion', etiqueta: t('variacion.revalorizacion'), valor: variacion.revalorizacion },
    { clave: 'ajustes', etiqueta: t('variacion.ajustes'), valor: variacion.ajustes },
  ];
  if (signo(variacion.saldos_iniciales) !== 0) {
    filas.push({
      clave: 'saldos',
      etiqueta: t('variacion.saldosIniciales'),
      valor: variacion.saldos_iniciales,
      nota: t('variacion.saldosInicialesNota'),
    });
  }

  return (
    <Card titulo={t('variacion.titulo', { mes: nombreMes(mes, locale) })}>
      <p className="mb-3 text-xs text-apagado sm:text-sm">{t('variacion.descripcion')}</p>
      <dl className="flex flex-col gap-2.5 text-sm sm:text-[15px]">
        {filas.map((f) => (
          <div key={f.clave} className="flex justify-between gap-3">
            <dt className="text-texto">
              {f.etiqueta}
              {f.nota !== undefined && <span className="block text-xs text-apagado">{f.nota}</span>}
            </dt>
            <dd className="cifras shrink-0 text-texto">{euros(f.valor)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-borde-fuerte pt-2.5 font-bold">
          <dt className="text-texto">{t('variacion.total')}</dt>
          <dd className={cx('cifras shrink-0', total < 0 ? 'text-negativo' : total > 0 ? 'text-positivo' : 'text-texto')}>
            {euros(variacion.variacion)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
