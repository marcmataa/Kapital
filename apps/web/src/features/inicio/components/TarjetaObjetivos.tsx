import { useState } from 'react';
import { AlertTriangle, ArrowRight, Check, X, type LucideIcon } from 'lucide-react';
import { useListarCategoriasQuery } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { nombreCategoria as nombreVisible } from '@/shared/lib/categorias';
import { cx } from '@/shared/lib/cx';
import { aCentimos, formatearEuros } from '@/shared/lib/dinero';
import { Button, Card } from '@/shared/ui';
import { useInicioProgresoObjetivosQuery, type ProgresoObjetivo } from '../api/inicioApi';
import { barraAhorro, mesLargo, progresoBarra, restarImportes } from '../lib/calculos';
import { ErrorCarga, Esqueleto } from './Estados';
import { FormObjetivo } from './FormObjetivo';

interface Props {
  hoy: string;
}

/**
 * Estado de un objetivo, distinto según el tipo (auditoría F03): con un límite, pasarse es malo
 * («Límite excedido»); con el ahorro, llegar es bueno («Conseguido»). Nunca «Superado», que
 * significaba una cosa u otra según el objetivo.
 */
type Estado = 'dentro' | 'cerca' | 'excedido' | 'conseguido' | 'enCamino' | 'negativo';

const ESTILO: Record<Estado, { icono: LucideIcon; pastilla: string; barra: string }> = {
  dentro: { icono: Check, pastilla: 'bg-positivo-suave text-positivo', barra: 'bg-acento' },
  cerca: { icono: AlertTriangle, pastilla: 'bg-aviso-suave text-aviso', barra: 'bg-aviso' },
  excedido: { icono: X, pastilla: 'bg-negativo-suave text-negativo', barra: 'bg-negativo' },
  conseguido: { icono: Check, pastilla: 'bg-positivo-suave text-positivo', barra: 'bg-positivo' },
  enCamino: { icono: ArrowRight, pastilla: 'bg-superficie-2 text-apagado', barra: 'bg-acento' },
  negativo: { icono: X, pastilla: 'bg-negativo-suave text-negativo', barra: 'bg-negativo' },
};

/** Estado visual de un objetivo. Las cifras (exceso, restante) vienen de SQL; aquí solo se compara. */
function estadoDe(o: ProgresoObjetivo): Estado {
  if (o.tipo === 'ahorro_mensual') {
    if (o.restante === null) return 'conseguido';
    // Balance del mes en negativo: no es que vaya lento, es que va en sentido contrario.
    return aCentimos(o.actual) < 0n ? 'negativo' : 'enCamino';
  }
  if (o.exceso !== null) return 'excedido';
  return aCentimos(o.actual) * 10n >= aCentimos(o.importe) * 8n ? 'cerca' : 'dentro';
}

/**
 * Objetivos del mes en curso (`progreso_objetivos`, SQL):
 * - Ahorro mensual: balance del mes (hasta hoy) frente al importe, en una barra con el 0 marcado
 *   (un balance negativo se dibuja hacia la izquierda) y la marca del objetivo; si falta, cuánto,
 *   cuántos días quedan y cuánto hay que ahorrar al día.
 * - Límite de categoría: gasto neto de la categoría frente al límite; pasarse es «Te has pasado X».
 * Cada objetivo lleva su estado con icono, texto y color (nunca solo el color).
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

  /**
   * Línea bajo la barra: cuánto se ha pasado un límite, cuánto margen le queda (resta exacta en
   * céntimos) o cuánto falta por ahorrar, en cuántos días y a cuánto al día.
   */
  const detalle = (o: ProgresoObjetivo): string | null => {
    if (o.exceso !== null) return t('objetivos.excedidoEn', { importe: euros(o.exceso) });
    if (o.tipo === 'limite_categoria') {
      return t('objetivos.margen', { importe: euros(restarImportes(o.importe, o.actual)) });
    }
    if (o.tipo === 'ahorro_mensual' && o.restante !== null && o.ahorro_diario_necesario !== null) {
      return t(o.dias_restantes === 1 ? 'objetivos.faltanUltimoDia' : 'objetivos.faltan', {
        importe: euros(o.restante),
        dias: o.dias_restantes,
        diario: euros(o.ahorro_diario_necesario),
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
              const { icono: Icono, pastilla, barra } = ESTILO[estado];
              const titulo = nombre(o);
              const linea = detalle(o);
              const pct = progresoBarra(o.actual, o.importe);
              const texto = t('objetivos.progreso', { actual: euros(o.actual), objetivo: euros(o.importe) });
              const textoEstado = t(`objetivos.estado.${estado}`);
              const ahorro = o.tipo === 'ahorro_mensual' ? barraAhorro(o.actual, o.importe) : null;
              return (
                <li key={o.objetivo_id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="text-texto">{titulo}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid="estado-objetivo"
                        data-estado={estado}
                        className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold', pastilla)}
                      >
                        <Icono aria-hidden="true" className="size-3.5" />
                        {textoEstado}
                      </span>
                      <span className={cx('cifras', estado === 'excedido' || estado === 'negativo' ? 'text-negativo' : 'text-apagado')}>
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
                    aria-valuetext={[texto, textoEstado, ...(linea === null ? [] : [linea])].join(' · ')}
                    className="relative h-2.5 rounded-full bg-borde"
                  >
                    {ahorro === null ? (
                      <div data-estado={estado} className={cx('h-full rounded-full', barra)} style={{ width: `${pct}%` }} />
                    ) : (
                      <>
                        <div
                          data-estado={estado}
                          className={cx('absolute inset-y-0 rounded-full', barra)}
                          style={{ left: `${ahorro.desde}%`, width: `${ahorro.ancho}%` }}
                        />
                        {ahorro.cero > 0 && (
                          <span
                            data-testid="cero-ahorro"
                            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-texto"
                            style={{ left: `${ahorro.cero}%` }}
                          />
                        )}
                        <span
                          data-testid="marca-objetivo"
                          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-texto"
                          style={{ left: `${ahorro.objetivo}%` }}
                        />
                      </>
                    )}
                  </div>
                  {linea !== null && (
                    <p
                      data-testid="detalle-objetivo"
                      className={cx('cifras text-xs', estado === 'excedido' || estado === 'negativo' ? 'text-negativo' : 'text-apagado')}
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
