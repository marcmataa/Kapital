import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useIdioma, useT } from '@/shared/i18n';
import { aCentimos, formatearEuros, formatearPorcentaje, variacionPorcentual } from '@/shared/lib/dinero';
import { componerFecha, diasDelMes, finDeMes, inicioDeMes, mismoDiaMesAnterior, partesDe, sumarMeses } from '@/shared/lib/fechas';
import { cx } from '@/shared/lib/cx';
import type { PuntoPatrimonio } from '../api/inicioApi';
import {
  capitalizar,
  escalaEje,
  formatearDiaMes,
  formatearEurosEje,
  fraccion,
  mesLargo,
  restarImportes,
} from '../lib/calculos';

interface Props {
  /** Hoy en la zona del usuario ('YYYY-MM-DD'). */
  hoy: string;
  /** Mes del gráfico (día 1). Por defecto, el de hoy; si es un mes cerrado no hay día provisional. */
  mes?: string | undefined;
  /** Serie del mes mostrado (serie_patrimonio): hasta hoy, sin días anteriores a los datos. */
  actual: readonly PuntoPatrimonio[];
  /** Serie completa del mes anterior. */
  anterior: readonly PuntoPatrimonio[];
  className?: string;
}

const ANCHO_POR_DEFECTO = 640;
const MARCAS_X = [1, 5, 10, 15, 20, 25, 30];
const MARGEN = { arriba: 18, derecha: 16, abajo: 42 } as const;

/** Ancho real del contenedor (ResizeObserver) para que 1 unidad del SVG = 1 px y el texto no encoja. */
function useAncho(el: HTMLElement | null): number {
  const [ancho, setAncho] = useState(ANCHO_POR_DEFECTO);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([entrada]) => {
      const w = Math.round(entrada?.contentRect.width ?? 0);
      if (w > 0) setAncho(w);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [el]);
  return ancho;
}

/** Día del mes → importe, solo con los puntos del mes `inicioMes`. */
function porDia(serie: readonly PuntoPatrimonio[], inicioMes: string): Map<number, string> {
  const { anio, mes } = partesDe(inicioMes);
  const mapa = new Map<number, string>();
  for (const p of serie) {
    const f = partesDe(p.fecha);
    if (f.anio === anio && f.mes === mes) mapa.set(f.dia, p.patrimonio);
  }
  return mapa;
}

export interface LecturaDia {
  /** «15 oct» o «19 oct · hoy (provisional)». */
  titulo: string;
  /** Importe formateado o «sin datos todavía». */
  valor: string;
  /** Comparación con d' (sección 7) o vacío. */
  comparacion: string;
}

/**
 * Patrimonio diario del mes mostrado (línea continua) frente al mes anterior (discontinua, sobre
 * sus propios días). Reglas, sección 7.
 * - Mes en curso: la línea termina hoy, con punto hueco provisional.
 * - Mes cerrado: la línea llega al último día del mes, cerrado (punto lleno, sin «provisional»).
 * Se recorre día a día con ratón, dedo (pointer events, `touch-action: pan-y`) o teclado
 * (control deslizante accesible).
 */
export function GraficoCapital({ hoy, mes, actual, anterior, className }: Props) {
  const t = useT('inicio');
  const { locale } = useIdioma();
  const [contenedor, setContenedor] = useState<HTMLDivElement | null>(null);
  const ancho = useAncho(contenedor);

  const inicioActual = inicioDeMes(mes ?? hoy);
  const enCurso = inicioActual === inicioDeMes(hoy);
  // Fecha de referencia: hoy (provisional) o el último día del mes cerrado.
  const referencia = enCurso ? hoy : finDeMes(inicioActual);
  const refP = partesDe(referencia);
  const inicioAnterior = sumarMeses(inicioActual, -1);
  const diasActual = diasDelMes(refP.anio, refP.mes);
  const pa = partesDe(inicioAnterior);
  const diasAnterior = diasDelMes(pa.anio, pa.mes);
  const diasEje = Math.max(diasActual, diasAnterior);

  const valoresActual = porDia(actual, inicioActual);
  const valoresAnterior = porDia(anterior, inicioAnterior);

  const [diaSel, setDiaSel] = useState(refP.dia);

  // ---------------------------------------------------------------- Lectura del día elegido
  const fechaDe = (dia: number) => componerFecha({ ...refP, dia });

  const lectura = (dia: number): LecturaDia => {
    const fecha = fechaDe(dia);
    const fechaTexto = formatearDiaMes(fecha, locale);
    const esHoy = enCurso && fecha === hoy;
    const esFuturo = fecha > hoy;
    const valor = esFuturo ? undefined : valoresActual.get(dia);
    const fechaAnt = mismoDiaMesAnterior(fecha);
    const valorAnt = valoresAnterior.get(partesDe(fechaAnt).dia);
    const fechaAntTexto = formatearDiaMes(fechaAnt, locale);
    const titulo = esHoy ? t('grafico.lectura.hoy', { fecha: fechaTexto }) : fechaTexto;

    if (esFuturo) {
      return {
        titulo,
        valor: t('grafico.lectura.futuro'),
        comparacion:
          valorAnt === undefined
            ? ''
            : t('grafico.lectura.futuroAnterior', { fecha: fechaAntTexto, valor: formatearEuros(valorAnt, locale) }),
      };
    }
    if (valor === undefined) return { titulo, valor: t('grafico.lectura.sinDatos'), comparacion: '' };
    if (valorAnt === undefined) {
      return { titulo, valor: formatearEuros(valor, locale), comparacion: t('grafico.lectura.sinAnterior') };
    }
    const diferencia = formatearEuros(restarImportes(valor, valorAnt), locale, { signo: 'siempre' });
    const base = { fecha: fechaAntTexto, valor: formatearEuros(valorAnt, locale), diferencia };
    // % solo si patrimonio(d') > 0 (sección 7).
    const comparacion =
      aCentimos(valorAnt) > 0n
        ? t('grafico.lectura.comparacion', {
            ...base,
            porcentaje: formatearPorcentaje(variacionPorcentual(valor, valorAnt), locale, { signo: 'siempre' }),
          })
        : t('grafico.lectura.comparacionSinPorcentaje', base);
    return { titulo, valor: formatearEuros(valor, locale), comparacion };
  };

  const sel = lectura(diaSel);
  const textoSel = [`${sel.titulo} · ${sel.valor}`, sel.comparacion].filter(Boolean).join('. ');

  // ---------------------------------------------------------------- Escalas (solo píxeles)
  const todos = [...valoresActual.values(), ...valoresAnterior.values()].map(aCentimos);
  const hayDatos = todos.length > 0;
  const minimo = hayDatos ? todos.reduce((a, b) => (b < a ? b : a)) : 0n;
  const maximo = hayDatos ? todos.reduce((a, b) => (b > a ? b : a)) : 0n;
  const escala = escalaEje(minimo, maximo, 5);
  const etiquetasY = escala.ticks.map((c) => ({ c, texto: formatearEurosEje(c, locale) }));
  const largoEtiqueta = Math.max(...etiquetasY.map((e) => e.texto.length));

  const movil = ancho < 480;
  const alto = movil ? 240 : 270;
  const izquierda = Math.max(44, largoEtiqueta * 7 + 12);
  const anchoPlot = Math.max(1, ancho - izquierda - MARGEN.derecha);
  const altoPlot = alto - MARGEN.arriba - MARGEN.abajo;
  const x = (dia: number) => izquierda + ((dia - 1) / (diasEje - 1)) * anchoPlot;
  const y = (importe: string) => MARGEN.arriba + (1 - fraccion(aCentimos(importe), escala.min, escala.max)) * altoPlot;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const puntos = (m: Map<number, string>) =>
    [...m.entries()]
      .sort(([a], [b]) => a - b)
      .map(([d, v]) => `${r1(x(d))},${r1(y(v))}`)
      .join(' ');

  const diasConDatos = [...valoresActual.keys()].sort((a, b) => a - b);
  const primerDia = diasConDatos[0];
  const ultimoDia = diasConDatos[diasConDatos.length - 1];
  const fondoPlot = MARGEN.arriba + altoPlot;
  const area =
    primerDia !== undefined && ultimoDia !== undefined
      ? `${puntos(valoresActual)} ${r1(x(ultimoDia))},${fondoPlot} ${r1(x(primerDia))},${fondoPlot}`
      : '';

  const valorHoy = valoresActual.get(refP.dia);
  const xHoy = x(refP.dia);
  const yHoy = valorHoy !== undefined ? y(valorHoy) : 0;
  const etiquetaHoyALaIzquierda = xHoy > izquierda + anchoPlot * 0.6;
  const etiquetaHoyDebajo = yHoy < MARGEN.arriba + 22;

  const valorSel = diaSel <= refP.dia ? valoresActual.get(diaSel) : undefined;
  const diaAntSel = partesDe(mismoDiaMesAnterior(fechaDe(diaSel))).dia;
  const valorAntSel = valoresAnterior.get(diaAntSel);

  // ---------------------------------------------------------------- Interacción
  const elegirDesdePuntero = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const escalaX = rect.width > 0 ? ancho / rect.width : 1;
    const xu = (e.clientX - rect.left) * escalaX;
    const dia = Math.round(((xu - izquierda) / anchoPlot) * (diasEje - 1)) + 1;
    setDiaSel(Math.min(diasActual, Math.max(1, dia)));
  };

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    const pasos: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
    let siguiente: number | null = null;
    if (e.key in pasos) siguiente = diaSel + (pasos[e.key] ?? 0);
    else if (e.key === 'Home') siguiente = 1;
    else if (e.key === 'End') siguiente = diasActual;
    if (siguiente === null) return;
    e.preventDefault();
    setDiaSel(Math.min(diasActual, Math.max(1, siguiente)));
  };

  const nombreActual = capitalizar(mesLargo(inicioActual, locale), locale);
  const nombreAnterior = capitalizar(mesLargo(inicioAnterior, locale), locale);

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-texto">{t('grafico.titulo')}</h2>
        <span className="flex gap-3.5 text-xs text-apagado sm:text-sm" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-sm bg-acento" />
            {nombreActual}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-tenue" />
            {nombreAnterior}
          </span>
        </span>
      </div>

      {!hayDatos ? (
        <p className="rounded-xl bg-superficie-2 px-3 py-6 text-center text-sm text-apagado">{t(enCurso ? 'grafico.vacio' : 'grafico.vacioCerrado')}</p>
      ) : (
        <>
          <div
            data-testid="lectura-grafico"
            className="flex min-h-12 flex-col gap-0.5 rounded-xl bg-superficie-2 px-3 py-2"
          >
            <span className="text-sm font-semibold text-texto">
              {sel.titulo} · <span className="cifras">{sel.valor}</span>
            </span>
            {sel.comparacion !== '' && <span className="cifras text-xs text-apagado sm:text-sm">{sel.comparacion}</span>}
          </div>

          <p className="sr-only">
            {t(enCurso ? 'grafico.alternativa' : 'grafico.alternativaCerrado', {
              mesActual: nombreActual,
              mesAnterior: nombreAnterior,
              valorHoy: valorHoy !== undefined ? formatearEuros(valorHoy, locale) : t('grafico.lectura.sinDatos'),
              fecha: formatearDiaMes(referencia, locale),
            })}
          </p>

          <div
            ref={setContenedor}
            role="slider"
            tabIndex={0}
            aria-label={t('grafico.control')}
            aria-valuemin={1}
            aria-valuemax={diasActual}
            aria-valuenow={diaSel}
            aria-valuetext={textoSel}
            onKeyDown={alTeclado}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
          >
            <svg
              width={ancho}
              height={alto}
              viewBox={`0 0 ${ancho} ${alto}`}
              aria-hidden="true"
              className="block h-auto w-full cursor-crosshair touch-pan-y select-none"
              onPointerMove={elegirDesdePuntero}
              onPointerDown={elegirDesdePuntero}
            >
              <g className="stroke-borde" strokeWidth={1}>
                {etiquetasY.map(({ c }) => {
                  const yy = r1(MARGEN.arriba + (1 - fraccion(c, escala.min, escala.max)) * altoPlot);
                  return <line key={c.toString()} x1={izquierda} x2={izquierda + anchoPlot} y1={yy} y2={yy} />;
                })}
              </g>
              <g className="fill-apagado text-xs" textAnchor="end">
                {etiquetasY.map(({ c, texto }) => (
                  <text
                    key={c.toString()}
                    x={izquierda - 8}
                    y={r1(MARGEN.arriba + (1 - fraccion(c, escala.min, escala.max)) * altoPlot + 4)}
                  >
                    {texto}
                  </text>
                ))}
              </g>
              <g className="fill-apagado text-xs" textAnchor="middle">
                {MARCAS_X.filter((d) => d <= diasEje).map((d) => (
                  <text key={d} x={r1(x(d))} y={fondoPlot + 18}>
                    {d}
                  </text>
                ))}
              </g>
              <text
                x={r1(izquierda + anchoPlot / 2)}
                y={alto - 6}
                textAnchor="middle"
                className="fill-tenue text-[11px]"
              >
                {t('grafico.ejeX')}
              </text>

              <line
                x1={r1(x(diaSel))}
                x2={r1(x(diaSel))}
                y1={MARGEN.arriba}
                y2={fondoPlot}
                className="stroke-borde-fuerte"
                strokeWidth={1.5}
              />

              {valoresAnterior.size > 0 && (
                <polyline
                  data-testid="linea-anterior"
                  points={puntos(valoresAnterior)}
                  fill="none"
                  className="stroke-tenue"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              )}
              {area !== '' && <polygon points={area} className="fill-acento" fillOpacity={0.1} />}
              {valoresActual.size > 0 && (
                <polyline
                  data-testid="linea-actual"
                  points={puntos(valoresActual)}
                  fill="none"
                  className="stroke-acento"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {valorAntSel !== undefined && (
                <circle cx={r1(x(diaAntSel))} cy={r1(y(valorAntSel))} r={4} className="fill-tenue" />
              )}
              {valorSel !== undefined && diaSel !== refP.dia && (
                <circle cx={r1(x(diaSel))} cy={r1(y(valorSel))} r={5} className="fill-acento" />
              )}

              {valorHoy !== undefined && (
                <>
                  <circle
                    data-testid={enCurso ? 'punto-hoy' : 'punto-cierre'}
                    cx={r1(xHoy)}
                    cy={r1(yHoy)}
                    r={6}
                    className={enCurso ? 'fill-superficie stroke-acento' : 'fill-acento stroke-acento'}
                    strokeWidth={3}
                  />
                  <text
                    x={r1(etiquetaHoyALaIzquierda ? xHoy - 10 : xHoy + 10)}
                    y={r1(etiquetaHoyDebajo ? yHoy + 22 : yHoy - 12)}
                    textAnchor={etiquetaHoyALaIzquierda ? 'end' : 'start'}
                    className="fill-texto text-xs font-medium"
                  >
                    {enCurso ? t('grafico.hoy', { fecha: formatearDiaMes(hoy, locale) }) : formatearDiaMes(referencia, locale)}
                  </text>
                </>
              )}
            </svg>
          </div>
          <p className="text-xs text-apagado sm:text-sm">{t(enCurso ? 'grafico.ayuda' : 'grafico.ayudaCerrado')}</p>
        </>
      )}
    </div>
  );
}
