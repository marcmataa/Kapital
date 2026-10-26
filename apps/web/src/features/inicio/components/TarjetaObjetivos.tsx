import { useState } from 'react';
import { useListarCategoriasQuery } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { nombreCategoria as nombreVisible } from '@/shared/lib/categorias';
import { cx } from '@/shared/lib/cx';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { Button, Card } from '@/shared/ui';
import { useInicioProgresoObjetivosQuery, type ProgresoObjetivo } from '../api/inicioApi';
import { mesLargo, progresoBarra } from '../lib/calculos';
import { ErrorCarga, Esqueleto } from './Estados';
import { FormObjetivo } from './FormObjetivo';

interface Props {
  hoy: string;
}

type Estado = 'normal' | 'cerca' | 'superado' | 'conseguido';

const COLOR_BARRA: Record<Estado, string> = {
  normal: 'bg-acento',
  conseguido: 'bg-positivo',
  cerca: 'bg-aviso',
  superado: 'bg-negativo',
};

/** Estado visual de un objetivo. Las cifras (exceso, restante) vienen de SQL; aquí solo se compara. */
function estadoDe(o: ProgresoObjetivo): Estado {
  if (o.tipo === 'ahorro_mensual') return o.restante === null ? 'conseguido' : 'normal';
  if (o.exceso !== null) return 'superado';
  return aCentimos(o.actual) * 10n >= aCentimos(o.importe) * 8n ? 'cerca' : 'normal';
}

/**
 * Objetivos del mes en curso (`progreso_objetivos`, SQL):
 * - Ahorro mensual: balance del mes (hasta hoy) frente al importe; si falta, cuántos días quedan
 *   y cuánto hay que ahorrar al día.
 * - Límite de categoría: gasto neto de la categoría frente al límite; pasarse es «Superado en X».
 */
export function TarjetaObjetivos({ hoy }: Props) {
  const t = useT('inicio');
  const tc = useT('common');
  const { locale } = useIdioma();
  const progreso = useInicioProgresoObjetivosQuery(hoy);
  const categorias = useListarCategoriasQuery();
  const [formAbierto, setFormAbierto] = useState(false);
  const euros = (v: string) => formatearEuros(v, locale);

  const nombreCategoria = (id: string | null) => {
    const categoria = (categorias.data ?? []).find((c) => c.id === id);
    return categoria ? nombreVisible(categoria, tc) : t('objetivos.categoriaDesconocida');
  };

  const nombre = (o: ProgresoObjetivo) =>
    o.tipo === 'ahorro_mensual'
      ? t('objetivos.ahorro', { importe: euros(o.importe) })
      : t('objetivos.limite', { categoria: nombreCategoria(o.categoria_id), importe: euros(o.importe) });

  /** Línea bajo la barra: cuánto se ha pasado un límite o cuánto queda por ahorrar al día. */
  const detalle = (o: ProgresoObjetivo): string | null => {
    if (o.exceso !== null) return t('objetivos.superadoEn', { importe: euros(o.exceso) });
    if (o.tipo === 'ahorro_mensual' && o.restante !== null && o.ahorro_diario_necesario !== null) {
      return t(o.dias_restantes === 1 ? 'objetivos.proyeccionUltimoDia' : 'objetivos.proyeccion', {
        dias: o.dias_restantes,
        importe: euros(o.ahorro_diario_necesario),
      });
    }
    return null;
  };

  const datos = progreso.currentData;

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
        {progreso.isError ? (
          <ErrorCarga onReintentar={() => void progreso.refetch()} />
        ) : datos === undefined ? (
          <>
            <Esqueleto className="h-10" />
            <Esqueleto className="h-10" />
          </>
        ) : datos.length === 0 ? (
          !formAbierto && <p className="text-sm text-apagado">{t('objetivos.vacio')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {datos.map((o) => {
              const estado = estadoDe(o);
              const titulo = nombre(o);
              const linea = detalle(o);
              const pct = progresoBarra(o.actual, o.importe);
              const texto = t('objetivos.progreso', { actual: euros(o.actual), objetivo: euros(o.importe) });
              return (
                <li key={o.objetivo_id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="text-texto">{titulo}</span>
                    <span className="flex items-center gap-2">
                      {estado === 'superado' && (
                        <span className="font-semibold text-negativo">{t('objetivos.superado')}</span>
                      )}
                      {estado === 'conseguido' && (
                        <span className="font-semibold text-positivo">{t('objetivos.conseguido')}</span>
                      )}
                      <span
                        className={cx(
                          'cifras',
                          estado === 'superado' || aCentimos(o.actual) < 0n ? 'text-negativo' : 'text-apagado',
                        )}
                      >
                        {texto}
                      </span>
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={titulo}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-valuetext={linea === null ? texto : `${texto} · ${linea}`}
                    className="h-2.5 overflow-hidden rounded-full bg-borde"
                  >
                    <div
                      data-estado={estado}
                      className={cx('h-full rounded-full', COLOR_BARRA[estado])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {linea !== null && (
                    <p
                      data-testid="detalle-objetivo"
                      className={cx('cifras text-xs', estado === 'superado' ? 'text-negativo' : 'text-apagado')}
                    >
                      {linea}
                    </p>
                  )}
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
