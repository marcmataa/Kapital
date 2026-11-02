import { useId } from 'react';
import { Info, TriangleAlert, X } from 'lucide-react';
import type { Categoria } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { MoneyInput, Select, importeParaEditar } from '@/shared/ui';
import type { GastoDevolvible } from '../api/sqlApi';
import type { Reparto } from '../lib/reparto';

interface Props {
  /** Gastos elegidos, en el orden elegido. */
  seleccion: readonly GastoDevolvible[];
  reparto: Reparto | null;
  /** Total recibido, 'd.dd' (null si el importe no es válido). */
  total: string | null;
  /** Importes escritos a mano (texto tal cual) por id de gasto. */
  manuales: Readonly<Record<string, string>>;
  onImporte: (id: string, texto: string) => void;
  onRepartir: () => void;
  onQuitar: (gasto: GastoDevolvible) => void;
  /** Categorías de ingreso para el sobrante (activas). */
  categoriasIngreso: readonly Categoria[];
  categoriaSobrante: string;
  onCategoriaSobrante: (id: string) => void;
}

/**
 * Reparto de una devolución nueva entre los gastos elegidos (reglas, sección 3, cambio del
 * 02/11/2026). Con varios gastos, cada uno tiene su importe (se reparte solo, llenando lo pendiente
 * en el orden elegido, y se puede ajustar). Si lo recibido supera lo pendiente, se avisa ANTES de
 * guardar de que el sobrante se guarda como ingreso, con su categoría (Otros ingresos por defecto).
 */
export function RepartoDevolucion({
  seleccion,
  reparto,
  total,
  manuales,
  onImporte,
  onRepartir,
  onQuitar,
  categoriasIngreso,
  categoriaSobrante,
  onCategoriaSobrante,
}: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const id = useId();
  const euros = (importe: string) => formatearEuros(importe, locale);
  const varios = seleccion.length > 1;
  const linea = (gastoId: string) => reparto?.lineas.find((l) => l.id === gastoId);
  const hayManuales = Object.keys(manuales).length > 0;
  const categoria = categoriasIngreso.find((c) => c.id === categoriaSobrante);

  const errorLinea = (gastoId: string): string | undefined => {
    const l = linea(gastoId);
    if (l?.error === 'importe') return t('validacion.importe');
    if (l?.error === 'supera') return t('validacion.devolucionSupera', { pendiente: euros(l.pendiente) });
    if (l?.error === 'vacia') return t('form.repartoVacia');
    return undefined;
  };

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3">
      <h2 id={`${id}-titulo`} className="sr-only">
        {t('form.reparto')}
      </h2>

      {varios && (
        <>
          <p className="text-xs text-apagado">{t('form.repartoAyuda')}</p>
          <ul className="flex flex-col gap-3">
            {seleccion.map((g) => {
              const l = linea(g.id);
              const texto = manuales[g.id] ?? (l?.importe != null ? importeParaEditar(l.importe, locale) : '');
              return (
                <li key={g.id} className="flex items-start gap-2">
                  <MoneyInput
                    label={t('form.repartoImporte', { concepto: g.concepto, fecha: formatearFecha(g.fecha, locale, 'corta') })}
                    value={texto}
                    onChange={(v) => onImporte(g.id, v)}
                    ayuda={t('form.candidatoQueda', { pendiente: euros(g.pendiente) })}
                    error={errorLinea(g.id)}
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onQuitar(g)}
                    aria-label={t('form.repartoQuitar', { concepto: g.concepto, fecha: formatearFecha(g.fecha, locale, 'corta') })}
                    className={cx(
                      'area-tactil mt-7 rounded-full p-2 text-apagado hover:bg-superficie-2',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                    )}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {hayManuales && (
            <button
              type="button"
              onClick={onRepartir}
              className="area-tactil self-start text-sm font-medium text-enlace hover:underline"
            >
              {t('form.repartoAutomatico')}
            </button>
          )}
        </>
      )}

      {!varios && seleccion.length === 1 && errorLinea(seleccion[0]?.id ?? '') !== undefined && (
        <p className="text-xs font-medium text-negativo">{errorLinea(seleccion[0]?.id ?? '')}</p>
      )}

      {reparto?.error === 'no_cuadra' && total !== null && (
        <p role="alert" className="flex gap-2 rounded-xl bg-negativo-suave px-3 py-2.5 text-sm font-medium text-negativo">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{t('form.repartoNoCuadra', { repartido: euros(reparto.repartido), total: euros(total) })}</span>
        </p>
      )}

      {reparto?.sobrante != null && total !== null && (
        <div className="flex flex-col gap-3 rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2.5">
          <p role="status" className="flex gap-2 text-sm text-aviso">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{varios
              ? t('form.sobranteVarios', {
                  total: euros(total),
                  repartido: euros(reparto.repartido),
                  n: seleccion.length,
                  sobrante: euros(reparto.sobrante),
                  categoria: categoria ? nombreCategoria(categoria) : t('meta.sinCategoria'),
                })
              : t('form.sobranteUno', {
                  total: euros(total),
                  repartido: euros(reparto.repartido),
                  concepto: seleccion[0]?.concepto ?? '',
                  sobrante: euros(reparto.sobrante),
                  categoria: categoria ? nombreCategoria(categoria) : t('meta.sinCategoria'),
                })}</span>
          </p>
          <Select
            label={t('form.categoriaSobrante')}
            value={categoriaSobrante}
            onChange={(e) => onCategoriaSobrante(e.target.value)}
          >
            {categoriaSobrante === '' && <option value="">{t('form.elegirCategoria')}</option>}
            {categoriasIngreso.map((c) => (
              <option key={c.id} value={c.id}>
                {nombreCategoria(c)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </section>
  );
}
