import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { LOCALE_DE, useIdioma, useT } from '@/shared/i18n';
import { aCentimos, formatearEuros, formatearPorcentaje } from '@/shared/lib/dinero';
import { cx } from '@/shared/lib/cx';
import { formatearMes } from '@/shared/lib/fechas';
import {
  categoriasDelResultado,
  importeAbsoluto,
  sentidoResultado,
  type CategoriaGasto,
  type FilaCategoriaResultado,
} from '@/shared/lib/resultadoMes';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';

interface Props {
  /** Totales del periodo, de SQL (sección 3): Balance = Ingresos − Gastos netos. */
  ingresos: string;
  gastosNetos: string;
  balance: string;
  /** Gasto neto por categoría del mismo periodo (gastos − devoluciones, sección 8). */
  categorias: readonly CategoriaGasto[];
  /** Mes del periodo ('2026-10-01'): la frase de un mes cerrado lo nombra. */
  mes: string;
  /** Mes en curso: la frase dice «hasta hoy» (el balance es provisional, sección 3). */
  enCurso: boolean;
  /** Lo que va debajo (conclusión del mes, explicaciones). */
  children?: ReactNode;
}

/** Ancho (0–100) de `parte` sobre `total`, en céntimos: solo una coordenada de dibujo. */
function ancho(parte: string, total: bigint): number {
  if (total <= 0n) return 0;
  const c = aCentimos(parte);
  const abs = c < 0n ? -c : c;
  return Number((abs * 10_000n) / total) / 100;
}

const RAYADO_RESTO = 'repeating-linear-gradient(135deg, var(--k-apagado) 0 2px, transparent 2px 5px)';

/**
 * «De tus ingresos a tu balance»: de dónde sale el balance del mes, para leerlo en unos segundos
 * (Estadísticas › Balance y Análisis lo usan igual).
 * 1. Una frase: «Este mes has ingresado X y gastado Y: te quedan Z» (o «te faltan», «hasta hoy»).
 * 2. Tres barras en la misma escala (ingresos, gastos, balance) con los importes siempre a la
 *    vista, sin pasar el ratón.
 * 3. Las categorías que más pesan, de mayor a menor (máximo 5; el resto en «Resto de categorías»),
 *    con importe y % sobre los gastos (sección 8: sobre las categorías positivas). Las negativas
 *    van aparte, sin %.
 * 4. Las mismas cifras en una tabla desplegable.
 * Los totales vienen de SQL; aquí solo se reparten anchos y porcentajes en céntimos bigint.
 */
export function ResultadoMes({ ingresos, gastosNetos, balance, categorias, mes, enCurso, children }: Props) {
  const t = useT('common');
  const { idioma } = useIdioma();
  const locale = LOCALE_DE[idioma];
  const euros = (v: string) => formatearEuros(v, locale);
  const sentido = sentidoResultado(balance);
  const { principales, resto, negativas } = categoriasDelResultado(categorias);
  const vacio = aCentimos(ingresos) === 0n && aCentimos(gastosNetos) === 0n && principales.length === 0 && negativas.length === 0;

  if (vacio) {
    return (
      <Card titulo={t('resultado.titulo')} data-testid="resultado-mes">
        <EmptyState titulo={t('resultado.vacio')} className="py-6" />
      </Card>
    );
  }

  const frase = t(`resultado.frase.${enCurso ? 'enCurso' : 'cerrado'}.${sentido}`, {
    mes: formatearMes(mes, locale),
    ingresos: euros(ingresos),
    gastos: euros(gastosNetos),
    resultado: euros(importeAbsoluto(balance)),
  });

  // Las tres barras comparten escala: la mayor de las tres cifras.
  const escala = [ingresos, gastosNetos, balance].map((v) => {
    const c = aCentimos(v);
    return c < 0n ? -c : c;
  });
  const maximo = escala.reduce((a, b) => (b > a ? b : a), 0n);
  const tonoBalance = sentido === 'queda' ? 'positivo' : sentido === 'falta' ? 'negativo' : 'neutro';
  const barras = [
    { id: 'ingresos', etiqueta: t('resultado.ingresos'), valor: euros(ingresos), importe: ingresos, tono: 'positivo' },
    { id: 'gastos', etiqueta: t('resultado.gastos'), valor: euros(gastosNetos), importe: gastosNetos, tono: 'negativo' },
    {
      id: 'balance',
      etiqueta: t('resultado.balance'),
      valor: formatearEuros(balance, locale, { signo: 'siempre' }),
      importe: balance,
      tono: tonoBalance,
    },
  ] as const;

  const totalPositivas = principales.reduce((s, c) => s + aCentimos(c.gasto), 0n) + (resto ? aCentimos(resto.gasto) : 0n);
  const pct = (p: string | null) => formatearPorcentaje(p, locale);
  const nombreResto = resto ? t('resultado.resto', { n: String(resto.nombres.length) }) : '';

  return (
    <Card titulo={t('resultado.titulo')} data-testid="resultado-mes">
      <div className="flex flex-col gap-4">
        <p data-testid="frase-resultado" className="text-base leading-snug text-texto">
          {frase}
        </p>

        <ul aria-label={t('resultado.cuenta')} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 text-sm">
          {barras.map((b) => (
            <li key={b.id} className="contents">
              <span className={cx('text-apagado', b.id === 'balance' && 'font-semibold text-texto')}>{b.etiqueta}</span>
              <span aria-hidden="true" className="relative block h-3 rounded bg-borde">
                <span
                  data-testid="barra-resultado"
                  data-tipo={b.id}
                  className={cx(
                    'absolute inset-y-0 left-0 rounded',
                    b.tono === 'positivo' ? 'bg-positivo' : b.tono === 'negativo' ? 'bg-negativo' : 'bg-apagado',
                  )}
                  style={{ width: `${ancho(b.importe, maximo)}%` }}
                />
              </span>
              <span
                className={cx(
                  'cifras text-right whitespace-nowrap',
                  b.id === 'balance'
                    ? cx('font-semibold', b.tono === 'positivo' ? 'text-positivo' : b.tono === 'negativo' ? 'text-negativo' : 'text-texto')
                    : 'text-texto',
                )}
              >
                {b.valor}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-apagado sm:text-[13px]">{t('resultado.notaGastos')}</p>

        {(principales.length > 0 || negativas.length > 0) && (
          <section aria-labelledby="resultado-categorias" className="flex flex-col gap-3 border-t border-borde pt-4">
            <h3 id="resultado-categorias" className="text-sm font-semibold text-texto">
              {t('resultado.categoriasTitulo')}
            </h3>
            {principales.length > 0 && (
              <ul className="flex flex-col gap-3 text-sm">
                {principales.map((c) => (
                  <FilaCategoria key={c.id} fila={c} valor={euros(c.gasto)} porcentaje={pct(c.porcentaje)} ancho={ancho(c.gasto, totalPositivas)} />
                ))}
                {resto && (
                  <li data-testid="fila-categoria-resultado" className="flex flex-col gap-1.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundImage: RAYADO_RESTO }} />
                        <span className="text-texto">{nombreResto}</span>
                      </span>
                      <Cifras valor={euros(resto.gasto)} porcentaje={pct(resto.porcentaje)} />
                    </span>
                    <span aria-hidden="true" className="relative block h-2 rounded bg-borde">
                      <span className="block h-2 rounded" style={{ width: `${ancho(resto.gasto, totalPositivas)}%`, backgroundImage: RAYADO_RESTO }} />
                    </span>
                    <span className="text-xs text-apagado">{resto.nombres.join(', ')}</span>
                  </li>
                )}
              </ul>
            )}
            {negativas.length > 0 && (
              <ul aria-label={t('resultado.negativasTitulo')} className="flex flex-col gap-2 text-sm">
                {negativas.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 text-apagado">
                    <span>
                      {c.nombre} <span className="text-xs">({t('resultado.negativaNota')})</span>
                    </span>
                    <span className="cifras shrink-0 text-negativo">{euros(c.gasto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {children}

        <details className="border-t border-borde pt-3">
          <summary className="cursor-pointer text-sm font-medium text-apagado hover:text-texto">{t('resultado.verTabla')}</summary>
          <table data-testid="tabla-resultado" className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">{t('resultado.titulo')}</caption>
            <thead className="text-xs text-apagado">
              <tr>
                <th scope="col" className="py-1 font-medium">{t('resultado.tabla.concepto')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('resultado.tabla.importe')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('resultado.tabla.porcentaje')}</th>
              </tr>
            </thead>
            <tbody className="cifras">
              {barras.map((b) => (
                <tr key={b.id} className="border-t border-borde">
                  <th scope="row" className="py-1 font-normal">{b.etiqueta}</th>
                  <td className="py-1 text-right">{b.valor}</td>
                  <td className="py-1 text-right" />
                </tr>
              ))}
              {[...principales, ...negativas].map((c) => (
                <tr key={c.id} className="border-t border-borde">
                  <th scope="row" className="py-1 font-normal">{c.nombre}</th>
                  <td className="py-1 text-right">{euros(c.gasto)}</td>
                  <td className="py-1 text-right">{c.porcentaje === null ? '' : pct(c.porcentaje)}</td>
                </tr>
              ))}
              {resto && (
                <tr className="border-t border-borde">
                  <th scope="row" className="py-1 font-normal">{nombreResto}</th>
                  <td className="py-1 text-right">{euros(resto.gasto)}</td>
                  <td className="py-1 text-right">{pct(resto.porcentaje)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </details>
      </div>
    </Card>
  );
}

function Cifras({ valor, porcentaje }: { valor: string; porcentaje: string }) {
  const t = useT('common');
  return (
    <span className="cifras flex shrink-0 items-baseline gap-2 text-right">
      <span className="text-texto">{valor}</span>
      <small className="min-w-[3.25rem] text-[13px] text-apagado">
        {porcentaje}
        <span className="sr-only"> {t('resultado.deTusGastos')}</span>
      </small>
    </span>
  );
}

function FilaCategoria({ fila, valor, porcentaje, ancho: anchoBarra }: { fila: FilaCategoriaResultado; valor: string; porcentaje: string; ancho: number }) {
  const t = useT('common');
  return (
    <li data-testid="fila-categoria-resultado" className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: fila.color }} />
          {fila.href === undefined ? (
            <span className="break-words text-texto">{fila.nombre}</span>
          ) : (
            <Link
              to={fila.href}
              title={t('resultado.verMovimientos', { nombre: fila.nombre })}
              className="inline-flex items-center gap-0.5 break-words text-texto hover:underline focus-visible:outline-2 focus-visible:outline-acento"
            >
              {fila.nombre}
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-tenue" />
            </Link>
          )}
        </span>
        <Cifras valor={valor} porcentaje={porcentaje} />
      </span>
      <span aria-hidden="true" className="relative block h-2 rounded bg-borde">
        <span data-testid="barra-categoria-resultado" className="block h-2 rounded" style={{ width: `${anchoBarra}%`, backgroundColor: fila.color }} />
      </span>
    </li>
  );
}
