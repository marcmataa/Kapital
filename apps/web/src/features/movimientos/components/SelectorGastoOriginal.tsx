import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Categoria } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { aCentimos, formatearEuros, importePositivo } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { Badge, Input } from '@/shared/ui';
import { useMovimientosGastosDevolviblesQuery, type GastoDevolvible } from '../api/sqlApi';
import { esFechaValida } from '../lib/tipos';
import { useRoving } from './SelectoresFormulario';

/** Pausa tras escribir antes de pedir sugerencias o buscar (la consulta no bloquea el formulario). */
export const ESPERA_SUGERENCIAS_MS = 400;
/** Sugerencias como mucho, y puntuación mínima (0..100) para proponer un gasto sin palabras en común. */
const MAX_SUGERENCIAS = 3;
const PUNTUACION_MINIMA = 30;
const LIMITE_LISTA = 20;

/** `valor` tras `ms` sin cambios. */
function useDiferido<T>(valor: T, ms: number): T {
  const [diferido, setDiferido] = useState(valor);
  useEffect(() => {
    const id = window.setTimeout(() => setDiferido(valor), ms);
    return () => window.clearTimeout(id);
  }, [valor, ms]);
  return diferido;
}

interface Comunes {
  /** Lo que ya sabe el formulario de la devolución (texto tal cual). */
  concepto: string;
  importe: string;
  fecha: string;
  /** La devolución que se edita (no cuenta contra su propio gasto). */
  excluir: string | null;
  categorias: readonly Categoria[];
  error?: string | undefined;
}

/** Editar una devolución: un solo gasto (radiogroup). */
interface PropsUno extends Comunes {
  multiple?: false;
  /** Id del gasto elegido ('' si ninguno). */
  valor: string;
  /** Datos del gasto elegido (para el resumen y la categoría heredada). */
  elegido: GastoDevolvible | null;
  onElegir: (gasto: GastoDevolvible) => void;
}

/** Devolución nueva: uno o varios gastos (casillas), en el orden en que se marcan. */
interface PropsVarios extends Comunes {
  multiple: true;
  seleccion: readonly GastoDevolvible[];
  onAlternar: (gasto: GastoDevolvible) => void;
  /** Resumen de los gastos elegidos y su reparto (lo pinta el formulario). */
  resumen: ReactNode;
}

type Props = PropsUno | PropsVarios;

/**
 * «Gasto original» de una devolución (obligatorio). Sugerencias puntuadas por la base
 * (buscar_gastos_devolvibles: manda el parecido del nombre; importe y fecha desempatan; sin IA) que
 * nunca se eligen solas, un buscador que encuentra también gastos antiguos y la lista de gastos
 * recientes, plegada tras un botón para que «Guardar» quede cerca. Al editar, la lista es un
 * radiogroup (un gasto); en una devolución nueva, casillas (varios gastos, reglas, sección 3).
 */
export function SelectorGastoOriginal(props: Props) {
  const { concepto, importe, fecha, excluir, categorias, error } = props;
  const multiple = props.multiple === true;
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const id = useId();
  const [busqueda, setBusqueda] = useState('');
  const [verRecientes, setVerRecientes] = useState(false);

  const importeNormal = importePositivo(importe, locale);
  const fechaValida = esFechaValida(fecha) ? fecha : null;
  // Valores primitivos: el temporizador solo se reinicia cuando cambian de verdad.
  const pedido = {
    concepto: useDiferido(concepto.trim(), ESPERA_SUGERENCIAS_MS),
    importe: useDiferido(importeNormal, ESPERA_SUGERENCIAS_MS),
    fecha: useDiferido(fechaValida, ESPERA_SUGERENCIAS_MS),
  };
  const q = useDiferido(busqueda.trim(), ESPERA_SUGERENCIAS_MS);
  const buscando = q !== '';

  const sugerenciasQ = useMovimientosGastosDevolviblesQuery(
    {
      concepto: pedido.concepto === '' ? null : pedido.concepto,
      importe: pedido.importe,
      fecha: pedido.fecha,
      busqueda: null,
      excluir,
      limite: 10,
    },
    { skip: pedido.concepto.length < 3 && pedido.importe === null },
  );
  const listaQ = useMovimientosGastosDevolviblesQuery(
    {
      concepto: null,
      importe: null,
      fecha: fechaValida,
      busqueda: buscando ? q : null,
      excluir,
      limite: LIMITE_LISTA,
    },
    { skip: !buscando && !verRecientes },
  );

  // Una sugerencia tiene que encajar: palabras en común con el concepto o una puntuación mínima.
  // Al editar (un solo gasto) además tiene que caber el importe; en una devolución nueva lo que
  // no cabe se reparte o sobra. `data`: las anteriores se quedan mientras llegan las nuevas (sin
  // parpadeo); si la consulta falla, no hay sugerencias y el formulario sigue igual.
  const sugerencias = (sugerenciasQ.isError ? [] : (sugerenciasQ.data ?? []))
    .filter(
      (g) =>
        g.motivo !== 'reciente' &&
        (g.motivo === 'concepto_parecido' || g.motivo === 'palabras_en_comun' || g.puntuacion >= PUNTUACION_MINIMA) &&
        (multiple || importeNormal === null || aCentimos(g.pendiente) >= aCentimos(importeNormal)),
    )
    .slice(0, MAX_SUGERENCIAS);
  const idsSugeridos = new Set(sugerencias.map((g) => g.id));
  // currentData: mientras llega otra búsqueda no se enseñan resultados de la anterior.
  const lista = (listaQ.currentData ?? []).filter((g) => !idsSugeridos.has(g.id));
  const mostrarLista = buscando || verRecientes;

  const elegidos = multiple ? props.seleccion.map((g) => g.id) : props.valor === '' ? [] : [props.valor];
  const marcar = (g: GastoDevolvible) => (multiple ? props.onAlternar(g) : props.onElegir(g));

  const idEtiqueta = `${id}-etiqueta`;
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const idLista = `${id}-lista`;

  const elegidoUno = !multiple && props.elegido !== null && props.valor === props.elegido.id ? props.elegido : null;
  const categoriaUno = categorias.find((c) => c.id === elegidoUno?.categoria_id);

  const comunesLista = {
    elegidos,
    multiple,
    onElegir: marcar,
    datos: datosCandidato,
    concepto: textoConcepto,
    errorId: error ? idError : undefined,
  };

  return (
    <section aria-labelledby={idEtiqueta} aria-describedby={idAyuda} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={idEtiqueta} className="text-sm font-medium text-texto">
          {t('form.gastoOriginal')}
        </h2>
        <p id={idAyuda} className="text-xs text-apagado">
          {t(multiple ? 'form.gastoOriginalAyudaVarios' : 'form.gastoOriginalAyuda')}
        </p>
      </div>

      {sugerencias.length > 0 && (
        <ListaCandidatos titulo={t('form.sugerencias')} ayuda={t('form.sugerenciasAyuda')} gastos={sugerencias} conMotivo {...comunesLista} />
      )}
      {sugerenciasQ.isError && (
        <p role="note" className="text-xs text-apagado">
          {t('form.sugerenciasError')}
        </p>
      )}

      <Input
        label={t('form.buscarGasto')}
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        ayuda={t('form.buscarGastoAyuda')}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={(e) => {
          // Enter en el buscador no envía el formulario.
          if (e.key === 'Enter') e.preventDefault();
        }}
      />

      {!buscando && (
        <button
          type="button"
          aria-expanded={verRecientes}
          aria-controls={idLista}
          onClick={() => setVerRecientes((v) => !v)}
          className={cx(
            'area-tactil flex items-center justify-between gap-2 rounded-xl border border-borde-input px-3 py-2 text-left text-sm text-texto',
            'hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
          )}
        >
          {t(verRecientes ? 'form.ocultarRecientes' : 'form.verRecientes')}
          <ChevronDown aria-hidden="true" className={cx('size-4 shrink-0 transition-transform', verRecientes && 'rotate-180')} />
        </button>
      )}

      <div id={idLista} hidden={!mostrarLista}>
        {!mostrarLista ? null : listaQ.isError ? (
          <p role="alert" className="text-sm text-negativo">
            {t('form.gastosError')}
          </p>
        ) : listaQ.isFetching && lista.length === 0 ? (
          <p role="status" className="text-sm text-apagado">
            {t('form.gastosCargando')}
          </p>
        ) : lista.length === 0 ? (
          <p role="status" className="text-sm text-apagado">
            {buscando ? t('form.gastosSinResultados') : sugerencias.length > 0 ? t('form.gastosSoloSugeridos') : t('form.gastosVacio')}
          </p>
        ) : (
          <ListaCandidatos titulo={buscando ? t('form.gastosResultados') : t('form.gastosRecientes')} gastos={lista} {...comunesLista} />
        )}
      </div>

      {/* Debajo de las listas: al elegir, lo de arriba no cambia de tamaño ni se mueve. */}
      <div
        role="status"
        className={cx(
          'rounded-xl border px-3 py-2.5 text-sm',
          error ? 'border-negativo bg-negativo-suave' : 'border-borde bg-superficie-2',
        )}
      >
        {multiple ? (
          props.seleccion.length > 0 ? (
            props.resumen
          ) : (
            <span className="text-apagado">{t('form.gastoElegidoNinguno')}</span>
          )
        ) : elegidoUno !== null ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-apagado">{t('form.gastoElegido')}</span>
            <span className="font-medium text-texto">{textoConcepto(elegidoUno)}</span>
            <span className="text-xs text-apagado tabular-nums">{datosCandidato(elegidoUno)}</span>
            {categoriaUno !== undefined && (
              <span className="text-xs text-apagado">{t('form.categoriaHeredada', { categoria: nombreCategoria(categoriaUno) })}</span>
            )}
          </div>
        ) : (
          <span className="text-apagado">{t('form.gastoElegidoNinguno')}</span>
        )}
      </div>
      {error && (
        <p id={idError} className="text-xs font-medium text-negativo">
          {error}
        </p>
      )}
    </section>
  );

  function textoConcepto(g: GastoDevolvible): string {
    return g.comercio !== null && g.comercio !== '' && g.comercio !== g.concepto ? `${g.concepto} · ${g.comercio}` : g.concepto;
  }

  function datosCandidato(g: GastoDevolvible): string {
    return [
      formatearFecha(g.fecha, locale, 'corta'),
      t('form.candidatoImporte', { importe: formatearEuros(g.importe, locale) }),
      t('form.candidatoQueda', { pendiente: formatearEuros(g.pendiente, locale) }),
    ].join(' · ');
  }
}

interface PropsLista {
  titulo: string;
  ayuda?: string;
  gastos: readonly GastoDevolvible[];
  /** Ids elegidos. */
  elegidos: readonly string[];
  multiple: boolean;
  conMotivo?: boolean;
  onElegir: (gasto: GastoDevolvible) => void;
  datos: (g: GastoDevolvible) => string;
  concepto: (g: GastoDevolvible) => string;
  errorId?: string | undefined;
}

/**
 * Candidatos. Un gasto: radiogroup (solo el elegido, o el primero, es tabulable; las flechas se
 * mueven y eligen). Varios: grupo de casillas (cada una tabulable; Espacio o Intro la marca).
 */
function ListaCandidatos({
  titulo,
  ayuda,
  gastos,
  elegidos,
  multiple,
  conMotivo = false,
  onElegir,
  datos,
  concepto,
  errorId,
}: PropsLista) {
  const t = useT('movimientos');
  const id = useId();
  const { mover, registrar } = useRoving(gastos.length, (i) => {
    const g = gastos[i];
    if (g && !multiple) onElegir(g);
  });
  const tabulable = gastos.find((g) => elegidos.includes(g.id))?.id ?? gastos[0]?.id;
  const describe = [ayuda !== undefined ? `${id}-ayuda` : null, errorId ?? null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-titulo`} className="text-xs font-semibold tracking-wide text-apagado uppercase">
        {titulo}
      </span>
      {ayuda !== undefined && (
        <p id={`${id}-ayuda`} className="text-xs text-apagado">
          {ayuda}
        </p>
      )}
      <div
        role={multiple ? 'group' : 'radiogroup'}
        aria-labelledby={`${id}-titulo`}
        aria-describedby={describe || undefined}
        className="flex flex-col gap-2"
      >
        {gastos.map((g, i) => {
          const activo = elegidos.includes(g.id);
          return (
            <button
              key={g.id}
              ref={registrar(i)}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={activo}
              tabIndex={multiple || g.id === tabulable ? 0 : -1}
              aria-label={`${concepto(g)}, ${datos(g)}`}
              onClick={() => onElegir(g)}
              onKeyDown={multiple ? undefined : (e) => mover(e, i)}
              className={cx(
                'flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                activo ? 'border-acento bg-acento-suave' : 'border-borde-input hover:bg-superficie-2',
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                {multiple && (
                  <span
                    aria-hidden="true"
                    className={cx(
                      'flex size-4 shrink-0 items-center justify-center rounded border',
                      activo ? 'border-acento bg-acento text-sobre-acento' : 'border-borde-input',
                    )}
                  >
                    {activo && <Check className="size-3" />}
                  </span>
                )}
                <span className={cx('min-w-0 flex-1 truncate text-texto', activo && 'font-semibold')}>{concepto(g)}</span>
                {conMotivo && <Badge tono="acento">{t(`motivo.${g.motivo}`)}</Badge>}
              </span>
              <span className="text-xs text-apagado tabular-nums">{datos(g)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
