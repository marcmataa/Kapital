import { Card } from '@/shared/ui';
import { useT } from '@/shared/i18n';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { sumarMeses } from '@/shared/lib/fechas';
import { useLocale } from '../hooks/useLocale';
import { nombreMes } from '../lib/formato';
import type { ResumenAnalisis } from '../schemas/esquemas';

interface Props {
  mes: string;
  actual: ResumenAnalisis;
  anterior: ResumenAnalisis | null;
}

/** Altura (0–100) para dibujar; se calcula con céntimos bigint, solo como coordenada. */
function altura(valor: string, maximo: bigint): number {
  if (maximo <= 0n) return 0;
  const c = aCentimos(valor);
  if (c <= 0n) return 0;
  return Number((c * 10_000n) / maximo) / 100;
}

/** Ingresos frente a gastos netos: mes anterior y este mes. Con tabla accesible. */
export function BarrasIngresosGastos({ mes, actual, anterior }: Props) {
  const t = useT('analisis');
  const locale = useLocale();
  const grupos = [
    ...(anterior ? [{ mes: sumarMeses(mes, -1), r: anterior }] : []),
    { mes, r: actual },
  ];
  let maximo = 0n;
  for (const g of grupos) {
    for (const v of [g.r.ingresos, g.r.gastos_netos]) {
      const c = aCentimos(v);
      if (c > maximo) maximo = c;
    }
  }
  const series = [
    { campo: 'ingresos', etiqueta: t('barras.ingresos'), clase: 'bg-acento' },
    { campo: 'gastos_netos', etiqueta: t('barras.gastosNetos'), clase: 'bg-negativo' },
  ] as const;

  return (
    <Card titulo={t('barras.titulo')}>
      <div aria-hidden="true" className="flex h-52 items-end justify-around gap-6 border-b border-borde-fuerte px-2">
        {grupos.map((g) => (
          <div key={g.mes} className="flex h-full w-full max-w-40 items-end gap-1.5">
            {series.map((s) => (
              <div key={s.campo} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="cifras text-[11px] text-texto">{formatearEuros(g.r[s.campo], locale)}</span>
                <div
                  title={`${nombreMes(g.mes, locale)} · ${s.etiqueta}: ${formatearEuros(g.r[s.campo], locale)}`}
                  className={`w-full rounded-t-md ${s.clase}`}
                  style={{ height: `${Math.max(altura(g.r[s.campo], maximo) * 0.85, 1)}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex justify-around gap-6 px-2 text-sm text-apagado">
        {grupos.map((g) => (
          <span key={g.mes} className="w-full max-w-40 text-center">
            {nombreMes(g.mes, locale)}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-apagado sm:text-sm">
        {series.map((s) => (
          <span key={s.campo} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 rounded-sm ${s.clase}`} />
            {s.etiqueta}
          </span>
        ))}
        {!anterior && <span>{t('barras.sinAnterior')}</span>}
      </div>
      <table className="sr-only">
        <caption>{t('barras.titulo')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('barras.mes')}</th>
            <th scope="col">{t('barras.ingresos')}</th>
            <th scope="col">{t('barras.gastosNetos')}</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.mes}>
              <th scope="row">{nombreMes(g.mes, locale)}</th>
              <td>{formatearEuros(g.r.ingresos, locale)}</td>
              <td>{formatearEuros(g.r.gastos_netos, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
