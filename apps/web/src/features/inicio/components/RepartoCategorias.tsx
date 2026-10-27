import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useT, useIdioma } from '@/shared/i18n';
import { aCentimos, desdeCentimos, formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { fraccion, porcentajeSobre } from '../lib/calculos';

export interface CategoriaReparto {
  id: string;
  nombre: string;
  color: string;
  /** Gasto neto de la categoría (gastos − devoluciones), string de la base. Puede ser negativo. */
  gasto: string;
}

interface Props {
  categorias: readonly CategoriaReparto[];
  /** Gastos netos del periodo (string de la base): el total de la cabecera. */
  totalGastoNeto: string;
  /** Texto junto al total. Por defecto «gasto neto». */
  etiquetaTotal?: string;
  /**
   * Si se pasa, cada fila de la lista enlaza a esta ruta, p. ej. Movimientos filtrado por la
   * categoría y el mes.
   */
  enlace?: ((categoriaId: string) => string) | undefined;
}

interface Fila extends CategoriaReparto {
  centimos: bigint;
}

/** Categorías que se ven una a una; a partir de ahí, el resto se suma en «Otras». */
export const MAX_CATEGORIAS_VISIBLES = 6;
const ID_OTRAS = '__otras__';
const COLOR_OTRAS = '#8a958f';

/** Tramos de la barra (en % del ancho), acumulando en céntimos exactos. */
function calcularTramos(positivas: readonly Fila[], total: bigint) {
  const tramos: { id: string; color: string; ancho: number }[] = [];
  let acumulado = 0n;
  for (const f of positivas) {
    const inicio = fraccion(acumulado, 0n, total) * 100;
    acumulado += f.centimos;
    tramos.push({ id: f.id, color: f.color, ancho: fraccion(acumulado, 0n, total) * 100 - inicio });
  }
  return tramos;
}

/**
 * Reparto del gasto por categoría (reglas, sección 8): una barra apilada al 100 % y la lista
 * debajo, en el mismo orden y con los mismos colores. Se lee mejor que un donut y ocupa menos.
 * - El % de cada categoría es sobre la suma de las categorías positivas: la barra suma 100 %.
 * - Una categoría en negativo se lista en rojo con su importe, pero no entra en la barra
 *   (solo admite valores positivos). Las de 0 € no se muestran.
 * Los importes se muestran desde sus strings; los tramos se calculan en céntimos (bigint).
 * Las MAX_CATEGORIAS_VISIBLES con más gasto se ven una a una; el resto se suma (en céntimos) en
 * «Otras (n)», para que la tarjeta no crezca con cada categoría nueva. Con `enlace`, cada fila
 * es un enlace; «Otras» no enlaza: son varias.
 */
export function RepartoCategorias({ categorias, totalGastoNeto, etiquetaTotal, enlace }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();

  const filas: Fila[] = categorias
    .map((c) => ({ ...c, centimos: aCentimos(c.gasto) }))
    .filter((c) => c.centimos !== 0n)
    .sort((a, b) => (a.centimos === b.centimos ? a.nombre.localeCompare(b.nombre, locale) : a.centimos > b.centimos ? -1 : 1));

  const positivas = filas.filter((f) => f.centimos > 0n);
  const totalPositivo = positivas.reduce((s, f) => s + f.centimos, 0n);

  const resto = positivas.slice(MAX_CATEGORIAS_VISIBLES);
  const otras = resto.reduce((s, f) => s + f.centimos, 0n);
  // Agrupar una sola categoría no ahorra nada: solo con dos o más.
  const visibles: Fila[] =
    resto.length > 1
      ? [
          ...positivas.slice(0, MAX_CATEGORIAS_VISIBLES),
          {
            id: ID_OTRAS,
            nombre: t('categorias.otras', { n: resto.length }),
            color: COLOR_OTRAS,
            gasto: desdeCentimos(otras),
            centimos: otras,
          },
        ]
      : positivas;
  const leyenda = [...visibles, ...filas.filter((f) => f.centimos < 0n)];

  const tramos = calcularTramos(visibles, totalPositivo);
  const basePorcentajes = desdeCentimos(totalPositivo);

  const total = formatearEuros(totalGastoNeto, locale);
  const etiqueta = etiquetaTotal ?? t('categorias.gastoNeto');

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-baseline gap-2">
        <span className="cifras text-2xl font-bold text-texto">{total}</span>
        <span className="text-sm text-apagado">{etiqueta}</span>
      </p>

      <div
        role="img"
        aria-label={`${t('categorias.grafico')}: ${total} ${etiqueta}`}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-superficie-3"
      >
        {tramos.map((tramo) => (
          <span
            key={tramo.id}
            data-testid="tramo-categoria"
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${tramo.ancho}%`, backgroundColor: tramo.color }}
          />
        ))}
      </div>

      <ul aria-label={t('categorias.lista')} className="flex w-full min-w-0 flex-col gap-1.5 text-sm sm:gap-2">
        {leyenda.map((f) => {
          const negativa = f.centimos < 0n;
          const contenido: ReactNode = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                <span className="break-words text-texto">{f.nombre}</span>
              </span>
              {negativa ? (
                <span className="flex flex-col items-end text-right">
                  <span className="cifras font-medium text-negativo">{formatearEuros(f.gasto, locale)}</span>
                  <span className="text-[13px] text-apagado">{t('categorias.negativa')}</span>
                </span>
              ) : (
                <span className="flex shrink-0 gap-2">
                  <span className="cifras text-apagado">{formatearEuros(f.gasto, locale)}</span>
                  <span className="cifras w-14 text-right text-texto">
                    {formatearPorcentaje(porcentajeSobre(f.gasto, basePorcentajes), locale)}
                  </span>
                </span>
              )}
            </>
          );
          const clases = 'flex items-start justify-between gap-3';
          return (
            <li key={f.id}>
              {enlace && f.id !== ID_OTRAS ? (
                <Link
                  to={enlace(f.id)}
                  title={t('categorias.verMovimientos', { categoria: f.nombre })}
                  className={`${clases} -mx-1.5 rounded-lg px-1.5 py-0.5 hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento`}
                >
                  {contenido}
                </Link>
              ) : (
                <div className={clases}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
