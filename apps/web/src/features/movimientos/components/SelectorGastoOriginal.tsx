import { useEffect, useId, useState } from 'react';
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
/** Sugerencias como mucho, y puntuación mínima (0..100) para proponer un gasto. */
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

interface Props {
  /** Id del gasto elegido ('' si ninguno). */
  valor: string;
  /** Datos del gasto elegido (para el resumen y la categoría heredada). */
  elegido: GastoDevolvible | null;
  /** Lo que ya sabe el formulario de la devolución (texto tal cual). */
  concepto: string;
  importe: string;
  fecha: string;
  /** La devolución que se edita (no cuenta contra su propio gasto). */
  excluir: string | null;
  categorias: readonly Categoria[];
  error?: string | undefined;
  onElegir: (gasto: GastoDevolvible) => void;
}

/**
 * «Gasto original» de una devolución (obligatorio). Sugerencias puntuadas por la base
 * (buscar_gastos_devolvibles: concepto, importe y fecha, sin IA) que nunca se eligen solas, y una
 * lista de gastos recientes con un buscador que encuentra también gastos antiguos. Cada lista es
 * un radiogroup accesible con teclado (flechas) y lector de pantalla.
 */
export function SelectorGastoOriginal({
  valor,
  elegido,
  concepto,
  importe,
  fecha,
  excluir,
  categorias,
  error,
  onElegir,
}: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const id = useId();
  const [busqueda, setBusqueda] = useState('');

  const importeNormal = importePositivo(importe, locale);
  const fechaValida = esFechaValida(fecha) ? fecha : null;
  // Valores primitivos: el temporizador solo se reinicia cuando cambian de verdad.
  const pedido = {
    concepto: useDiferido(concepto.trim(), ESPERA_SUGERENCIAS_MS),
    importe: useDiferido(importeNormal, ESPERA_SUGERENCIAS_MS),
    fecha: useDiferido(fechaValida, ESPERA_SUGERENCIAS_MS),
  };
  const q = useDiferido(busqueda.trim(), ESPERA_SUGERENCIAS_MS);

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
  const listaQ = useMovimientosGastosDevolviblesQuery({
    concepto: null,
    importe: null,
    fecha: fechaValida,
    busqueda: q === '' ? null : q,
    excluir,
    limite: LIMITE_LISTA,
  });

  // Una sugerencia tiene que encajar: puntuación mínima y, si hay importe, que quepa en lo pendiente.
  // `data`: las sugerencias anteriores se quedan mientras llegan las nuevas (sin parpadeo); si la
  // consulta falla, no hay sugerencias y el formulario sigue igual.
  const sugerencias = (sugerenciasQ.isError ? [] : (sugerenciasQ.data ?? []))
    .filter(
      (g) =>
        g.motivo !== 'reciente' &&
        g.puntuacion >= PUNTUACION_MINIMA &&
        (importeNormal === null || aCentimos(g.pendiente) >= aCentimos(importeNormal)),
    )
    .slice(0, MAX_SUGERENCIAS);
  const idsSugeridos = new Set(sugerencias.map((g) => g.id));
  // currentData: mientras llega otra búsqueda no se enseñan resultados de la anterior.
  const lista = (listaQ.currentData ?? []).filter((g) => !idsSugeridos.has(g.id));
  const categoria = categorias.find((c) => c.id === elegido?.categoria_id);

  const idEtiqueta = `${id}-etiqueta`;
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;

  return (
    <section aria-labelledby={idEtiqueta} aria-describedby={idAyuda} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={idEtiqueta} className="text-sm font-medium text-texto">
          {t('form.gastoOriginal')}
        </h2>
        <p id={idAyuda} className="text-xs text-apagado">
          {t('form.gastoOriginalAyuda')}
        </p>
      </div>

      <div
        role="status"
        className={cx(
          'rounded-xl border px-3 py-2.5 text-sm',
          error ? 'border-negativo bg-negativo-suave' : 'border-borde bg-superficie-2',
        )}
      >
        {elegido !== null && valor === elegido.id ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-apagado">{t('form.gastoElegido')}</span>
            <span className="font-medium text-texto">{textoConcepto(elegido)}</span>
            <span className="text-xs text-apagado tabular-nums">{datosCandidato(elegido)}</span>
            {categoria !== undefined && (
              <span className="text-xs text-apagado">{t('form.categoriaHeredada', { categoria: nombreCategoria(categoria) })}</span>
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

      {sugerencias.length > 0 && (
        <ListaCandidatos
          titulo={t('form.sugerencias')}
          ayuda={t('form.sugerenciasAyuda')}
          gastos={sugerencias}
          valor={valor}
          conMotivo
          onElegir={onElegir}
          datos={datosCandidato}
          concepto={textoConcepto}
          errorId={error ? idError : undefined}
        />
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

      {listaQ.isError ? (
        <p role="alert" className="text-sm text-negativo">
          {t('form.gastosError')}
        </p>
      ) : listaQ.isFetching && lista.length === 0 ? (
        <p role="status" className="text-sm text-apagado">
          {t('form.gastosCargando')}
        </p>
      ) : lista.length === 0 && sugerencias.length === 0 ? (
        <p role="status" className="text-sm text-apagado">
          {q === '' ? t('form.gastosVacio') : t('form.gastosSinResultados')}
        </p>
      ) : (
        lista.length > 0 && (
          <ListaCandidatos
            titulo={q === '' ? t('form.gastosRecientes') : t('form.gastosResultados')}
            gastos={lista}
            valor={valor}
            onElegir={onElegir}
            datos={datosCandidato}
            concepto={textoConcepto}
            errorId={error ? idError : undefined}
          />
        )
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
  valor: string;
  conMotivo?: boolean;
  onElegir: (gasto: GastoDevolvible) => void;
  datos: (g: GastoDevolvible) => string;
  concepto: (g: GastoDevolvible) => string;
  errorId?: string | undefined;
}

/** Candidatos como radiogroup: solo el elegido (o el primero) es tabulable; las flechas se mueven. */
function ListaCandidatos({ titulo, ayuda, gastos, valor, conMotivo = false, onElegir, datos, concepto, errorId }: PropsLista) {
  const t = useT('movimientos');
  const id = useId();
  const { mover, registrar } = useRoving(gastos.length, (i) => {
    const g = gastos[i];
    if (g) onElegir(g);
  });
  const tabulable = gastos.some((g) => g.id === valor) ? valor : gastos[0]?.id;
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
        role="radiogroup"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={describe || undefined}
        className="flex flex-col gap-2"
      >
        {gastos.map((g, i) => {
          const activo = g.id === valor;
          return (
            <button
              key={g.id}
              ref={registrar(i)}
              type="button"
              role="radio"
              aria-checked={activo}
              tabIndex={g.id === tabulable ? 0 : -1}
              onClick={() => onElegir(g)}
              onKeyDown={(e) => mover(e, i)}
              className={cx(
                'flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                activo ? 'border-acento bg-acento-suave' : 'border-borde-input hover:bg-superficie-2',
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-2">
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
