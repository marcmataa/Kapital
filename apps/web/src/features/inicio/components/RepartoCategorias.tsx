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
  /**
   * Ids de las categorías que se ven una a una; el resto se agrupa. Así la barra agrupa lo mismo
   * que otro gráfico de la misma pantalla (la cascada de Análisis, auditoría F07). Sin él, las
   * MAX_CATEGORIAS_VISIBLES con más gasto.
   */
  sueltas?: ReadonlySet<string> | undefined;
}

interface Fila extends CategoriaReparto {
  centimos: bigint;
}

/** Categorías que se ven una a una; a partir de ahí, el resto se suma en «Resto». */
export const MAX_CATEGORIAS_VISIBLES = 6;
const ID_RESTO = '__resto__';
/**
 * El grupo «Resto» no es una categoría: rayado neutro, no un gris sólido que se confundía con el
 * de «Otros gastos» (auditoría F07).
 */
const RAYADO_RESTO = 'repeating-linear-gradient(135deg, var(--k-apagado) 0 2px, transparent 2px 5px)';
const estilo = (f: { id: string; color: string }) =>
  f.id === ID_RESTO ? { backgroundImage: RAYADO_RESTO } : { backgroundColor: f.color };

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
 * Las MAX_CATEGORIAS_VISIBLES con más gasto (o las de `sueltas`) se ven una a una; el resto se
 * suma (en céntimos) en «Resto (n categorías)», rayado y con sus nombres debajo, para que la
 * tarjeta no crezca con cada categoría nueva. Con `enlace`, cada fila es un enlace; «Resto» no
 * enlaza: son varias.
 */
export function RepartoCategorias({ categorias, totalGastoNeto, etiquetaTotal, enlace, sueltas }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();

  const filas: Fila[] = categorias
    .map((c) => ({ ...c, centimos: aCentimos(c.gasto) }))
    .filter((c) => c.centimos !== 0n)
    .sort((a, b) => (a.centimos === b.centimos ? a.nombre.localeCompare(b.nombre, locale) : a.centimos > b.centimos ? -1 : 1));

  const positivas = filas.filter((f) => f.centimos > 0n);
  const totalPositivo = positivas.reduce((s, f) => s + f.centimos, 0n);

  const suelta = (f: Fila, i: number) => (sueltas ? sueltas.has(f.id) : i < MAX_CATEGORIAS_VISIBLES);
  const resto = positivas.filter((f, i) => !suelta(f, i));
  const sumaResto = resto.reduce((s, f) => s + f.centimos, 0n);
  // Agrupar una sola categoría no ahorra nada: solo con dos o más (con `sueltas`, lo que diga el
  // otro gráfico, que puede agrupar una sola).
  const agrupar = sueltas ? resto.length > 0 : resto.length > 1;
  const visibles: Fila[] = agrupar
    ? [
        ...positivas.filter((f, i) => suelta(f, i)),
        {
          id: ID_RESTO,
          nombre: resto.length === 1 ? t('categorias.restoUna') : t('categorias.resto', { n: resto.length }),
          color: '',
          gasto: desdeCentimos(sumaResto),
          centimos: sumaResto,
        },
      ]
    : positivas;
  const nombresResto = resto.map((f) => f.nombre).join(', ');
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
            style={{ width: `${tramo.ancho}%`, ...estilo(tramo) }}
          />
        ))}
      </div>

      <ul aria-label={t('categorias.lista')} className="flex w-full min-w-0 flex-col gap-1.5 text-sm sm:gap-2">
        {leyenda.map((f) => {
          const negativa = f.centimos < 0n;
          const contenido: ReactNode = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={estilo(f)} />
                <span className="flex min-w-0 flex-col">
                  <span className="break-words text-texto">{f.nombre}</span>
                  {/* Qué hay dentro del grupo: así no se confunde con «Otros gastos». */}
                  {f.id === ID_RESTO && (
                    <span data-testid="contenido-resto" className="text-[13px] break-words text-apagado">
                      {nombresResto}
                    </span>
                  )}
                </span>
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
              {enlace && f.id !== ID_RESTO ? (
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
