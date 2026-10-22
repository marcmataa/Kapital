import { useState } from 'react';
import { useListarCategoriasQuery, useListarObjetivosQuery, type Objetivo } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { Button, Card } from '@/shared/ui';
import type { GastoCategoria } from '../api/inicioApi';
import { mesLargo, progresoBarra } from '../lib/calculos';
import { ErrorCarga, Esqueleto } from './Estados';
import { FormObjetivo } from './FormObjetivo';

interface Props {
  hoy: string;
  /** Balance del mes hasta hoy (sección 3); undefined mientras carga. */
  balance: string | undefined;
  /** Gasto neto por categoría del mes hasta hoy; undefined mientras carga. */
  gastos: readonly GastoCategoria[] | undefined;
}

interface FilaObjetivo {
  id: string;
  nombre: string;
  actual: string;
  objetivo: string;
  pct: number;
  estado: 'normal' | 'cerca' | 'superado' | 'conseguido';
}

const COLOR_BARRA: Record<FilaObjetivo['estado'], string> = {
  normal: 'bg-acento',
  conseguido: 'bg-positivo',
  cerca: 'bg-aviso',
  superado: 'bg-negativo',
};

/**
 * Objetivos del mes:
 * - Ahorro mensual: balance del mes (hasta hoy) frente al importe.
 * - Límite de categoría: gasto neto de la categoría frente al límite; pasarse es «Superado» (rojo).
 */
export function TarjetaObjetivos({ hoy, balance, gastos }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const objetivos = useListarObjetivosQuery();
  const categorias = useListarCategoriasQuery();
  const [formAbierto, setFormAbierto] = useState(false);

  const nombreCategoria = (id: string | null) =>
    (categorias.data ?? []).find((c) => c.id === id)?.nombre ?? t('objetivos.categoriaDesconocida');

  const fila = (o: Objetivo, balanceMes: string, gastosMes: readonly GastoCategoria[]): FilaObjetivo => {
    const importe = formatearEuros(o.importe, locale);
    if (o.tipo === 'ahorro_mensual') {
      const conseguido = aCentimos(balanceMes) >= aCentimos(o.importe);
      return {
        id: o.id,
        nombre: t('objetivos.ahorro', { importe }),
        actual: balanceMes,
        objetivo: o.importe,
        pct: progresoBarra(balanceMes, o.importe),
        estado: conseguido ? 'conseguido' : 'normal',
      };
    }
    const actual = gastosMes.find((g) => g.categoria_id === o.categoria_id)?.gasto ?? '0.00';
    const a = aCentimos(actual);
    const l = aCentimos(o.importe);
    return {
      id: o.id,
      nombre: t('objetivos.limite', { categoria: nombreCategoria(o.categoria_id), importe }),
      actual,
      objetivo: o.importe,
      pct: progresoBarra(actual, o.importe),
      estado: a > l ? 'superado' : a * 10n >= l * 8n ? 'cerca' : 'normal',
    };
  };

  const cargando = objetivos.isLoading || balance === undefined || gastos === undefined;

  return (
    <Card
      titulo={t('objetivos.titulo', { mes: mesLargo(hoy, locale) })}
      accion={
        !formAbierto && (
          <Button variante="secundario" tamano="sm" onClick={() => setFormAbierto(true)}>
            {t('objetivos.anadir')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {objetivos.isError ? (
          <ErrorCarga onReintentar={() => void objetivos.refetch()} />
        ) : cargando ? (
          <>
            <Esqueleto className="h-10" />
            <Esqueleto className="h-10" />
          </>
        ) : (objetivos.data ?? []).length === 0 ? (
          !formAbierto && <p className="text-sm text-apagado">{t('objetivos.vacio')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {(objetivos.data ?? []).map((o) => {
              const f = fila(o, balance, gastos);
              const progreso = t('objetivos.progreso', {
                actual: formatearEuros(f.actual, locale),
                objetivo: formatearEuros(f.objetivo, locale),
              });
              return (
                <li key={f.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="text-texto">{f.nombre}</span>
                    <span className="flex items-center gap-2">
                      {f.estado === 'superado' && (
                        <span className="font-semibold text-negativo">{t('objetivos.superado')}</span>
                      )}
                      {f.estado === 'conseguido' && (
                        <span className="font-semibold text-positivo">{t('objetivos.conseguido')}</span>
                      )}
                      <span
                        className={cx(
                          'cifras',
                          f.estado === 'superado' || aCentimos(f.actual) < 0n ? 'text-negativo' : 'text-apagado',
                        )}
                      >
                        {progreso}
                      </span>
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={f.nombre}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={f.pct}
                    aria-valuetext={progreso}
                    className="h-2.5 overflow-hidden rounded-full bg-borde"
                  >
                    <div
                      data-estado={f.estado}
                      className={cx('h-full rounded-full', COLOR_BARRA[f.estado])}
                      style={{ width: `${f.pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {formAbierto && <FormObjetivo onHecho={() => setFormAbierto(false)} onCancelar={() => setFormAbierto(false)} />}
      </div>
    </Card>
  );
}
