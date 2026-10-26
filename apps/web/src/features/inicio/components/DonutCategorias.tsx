import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useT, useIdioma } from '@/shared/i18n';
import { aCentimos, desdeCentimos, formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { fraccion, porcentajeSobre } from '../lib/calculos';

export interface CategoriaDonut {
  id: string;
  nombre: string;
  color: string;
  /** Gasto neto de la categoría (gastos − devoluciones), string de la base. Puede ser negativo. */
  gasto: string;
}

interface Props {
  categorias: readonly CategoriaDonut[];
  /** Gastos netos del periodo (string de la base): el total del centro. */
  totalGastoNeto: string;
  /** Texto bajo el total. Por defecto «gasto neto». */
  etiquetaTotal?: string;
  /**
   * Si se pasa, cada categoría (fila de la leyenda y su arco) enlaza a esta ruta, p. ej.
   * Movimientos filtrado por la categoría y el mes.
   */
  enlace?: ((categoriaId: string) => string) | undefined;
}

const RADIO = 60;
const GROSOR = 22;
const LADO = 170;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

interface Fila extends CategoriaDonut {
  centimos: bigint;
}

/** Arcos del donut (en píxeles de la circunferencia), acumulando en céntimos exactos. */
function calcularArcos(positivas: readonly Fila[], total: bigint) {
  const arcos: { id: string; color: string; inicio: number; largo: number }[] = [];
  let acumulado = 0n;
  for (const f of positivas) {
    const inicio = fraccion(acumulado, 0n, total) * CIRCUNFERENCIA;
    acumulado += f.centimos;
    const fin = fraccion(acumulado, 0n, total) * CIRCUNFERENCIA;
    arcos.push({ id: f.id, color: f.color, inicio, largo: fin - inicio });
  }
  return arcos;
}

/**
 * Donut del gasto por categoría (reglas, sección 8):
 * - El % de cada categoría es sobre la suma de las categorías positivas: las del donut suman 100 %.
 * - Una categoría en negativo se lista en rojo con su importe, pero no entra en el donut
 *   (solo admite valores positivos). Las de 0 € no se muestran.
 * Los importes se muestran desde sus strings; los arcos se calculan en céntimos (bigint).
 * Móvil: donut pequeño a la izquierda y la leyenda a la derecha. Con `enlace`, cada categoría es
 * un enlace (la fila de la leyenda para teclado y lectores; el arco, atajo para ratón o dedo).
 */
export function DonutCategorias({ categorias, totalGastoNeto, etiquetaTotal, enlace }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();

  const filas: Fila[] = categorias
    .map((c) => ({ ...c, centimos: aCentimos(c.gasto) }))
    .filter((c) => c.centimos !== 0n)
    .sort((a, b) => (a.centimos === b.centimos ? a.nombre.localeCompare(b.nombre, locale) : a.centimos > b.centimos ? -1 : 1));

  const positivas = filas.filter((f) => f.centimos > 0n);
  const totalPositivo = positivas.reduce((s, f) => s + f.centimos, 0n);

  const arcos = calcularArcos(positivas, totalPositivo);
  const basePorcentajes = desdeCentimos(totalPositivo);

  const total = formatearEuros(totalGastoNeto, locale);
  const etiqueta = etiquetaTotal ?? t('categorias.gastoNeto');

  return (
    // Donut grande y centrado arriba; la leyenda debajo, a todo el ancho: los nombres se leen enteros.
    <div className="flex flex-col items-center gap-5">
      <svg
        viewBox={`0 0 ${LADO} ${LADO}`}
        role="img"
        aria-label={`${t('categorias.grafico')}: ${total} ${etiqueta}`}
        className="size-48 shrink-0 sm:size-52"
      >
        <g transform={`rotate(-90 ${LADO / 2} ${LADO / 2})`} fill="none" strokeWidth={GROSOR}>
          <circle cx={LADO / 2} cy={LADO / 2} r={RADIO} className="stroke-superficie-3" />
          {arcos.map((a) => {
            const arco = (
              <circle
                key={a.id}
                data-testid="arco-donut"
                cx={LADO / 2}
                cy={LADO / 2}
                r={RADIO}
                stroke={a.color}
                strokeDasharray={`${a.largo.toFixed(2)} ${CIRCUNFERENCIA.toFixed(2)}`}
                strokeDashoffset={(-a.inicio).toFixed(2)}
              />
            );
            return enlace ? (
              <Link key={a.id} to={enlace(a.id)} tabIndex={-1} aria-hidden="true" className="cursor-pointer">
                {arco}
              </Link>
            ) : (
              arco
            );
          })}
        </g>
        <text
          x={LADO / 2}
          y={LADO / 2 - 1}
          textAnchor="middle"
          className="cifras fill-texto text-[17px] font-bold"
        >
          {total}
        </text>
        <text x={LADO / 2} y={LADO / 2 + 18} textAnchor="middle" className="fill-apagado text-xs">
          {etiqueta}
        </text>
      </svg>

      <ul
        aria-label={t('categorias.lista')}
        className="flex w-full min-w-0 flex-col gap-1.5 text-sm sm:gap-2"
      >
        {filas.map((f) => {
          const negativa = f.centimos < 0n;
          const contenido: ReactNode = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: f.color }}
                />
                <span className="break-words text-texto">{f.nombre}</span>
              </span>
              {negativa ? (
                <span className="flex flex-col items-end text-right">
                  <span className="cifras font-medium text-negativo">{formatearEuros(f.gasto, locale)}</span>
                  <span className="text-xs text-apagado">{t('categorias.negativa')}</span>
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
              {enlace ? (
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
