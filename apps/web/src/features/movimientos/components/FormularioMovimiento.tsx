import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Info, TriangleAlert } from 'lucide-react';
import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { aCentimos, desdeCentimos, formatearEuros, importePositivo } from '@/shared/lib/dinero';
import { formatearFecha, sumarDias } from '@/shared/lib/fechas';
import { Field, Input, MoneyInput, SegmentedControl, Select, clasesControl, importeParaEditar } from '@/shared/ui';
import {
  useMovimientosActualizarMutation,
  useMovimientosCrearMutation,
  useMovimientosDevolucionesDeQuery,
  useMovimientosObtenerQuery,
} from '../api/movimientosApi';
import {
  useMovimientosCategoriasUsadasQuery,
  useMovimientosRegistrarDevolucionesMutation,
  useMovimientosSugerirCategoriaQuery,
  type GastoDevolvible,
} from '../api/sqlApi';
import { claveErrorMovimiento } from '../api/errores';
import { repartirDevolucion, repartoValido } from '../lib/reparto';
import { METODOS, type MetodoPago, type Movimiento, type TipoMovimiento } from '../lib/tipos';
import {
  CONCEPTO_MAXIMO,
  NOTAS_MAXIMO,
  crearEsquemaMovimiento,
  cuentaPorDefecto,
  cuentaUsable,
  eligeCategoria,
  ordenarPorUso,
  tipoCategoria,
  usaMetodo,
  type PayloadMovimiento,
  type ValoresMovimiento,
} from '../schemas/movimiento';
import { AjusteSaldoReal, PieFormulario } from './AjusteSaldoReal';
import { SelectorCategoria, SelectorTipo } from './SelectoresFormulario';
import { RepartoDevolucion } from './RepartoDevolucion';
import { SelectorGastoOriginal } from './SelectorGastoOriginal';

interface Props {
  inicial: ValoresMovimiento;
  cuentas: readonly Cuenta[];
  categorias: readonly Categoria[];
  hoy: string;
  /** Al editar: el movimiento tal como está guardado. */
  original?: Movimiento | undefined;
  /** Al editar un gasto: lo ya devuelto ('0.00' si nada). */
  devueltoOriginal?: string | null | undefined;
  onGuardado: () => void;
  onCancelar: () => void;
}

const MENSAJE_TIPO: Partial<Record<TipoMovimiento, 'form.avisoTraspaso' | 'form.avisoDevolucion'>> = {
  traspaso: 'form.avisoTraspaso',
  devolucion: 'form.avisoDevolucion',
};

/** Pausa tras escribir el concepto antes de pedir la sugerencia de categoría. */
const ESPERA_SUGERENCIA_MS = 400;

/**
 * Gasto vinculado a la devolución que se edita, con lo pendiente SIN contar esa devolución
 * (pendiente = importe − devuelto + importe actual de la devolución). Céntimos enteros.
 */
function gastoDeLaDevolucion(
  gasto: Movimiento | null | undefined,
  devuelto: string | undefined,
  original: Movimiento | undefined,
): GastoDevolvible | null {
  if (gasto == null || devuelto === undefined || original === undefined || gasto.tipo !== 'gasto') return null;
  const propio = original.devolucion_de === gasto.id ? aCentimos(original.importe) : 0n;
  return {
    id: gasto.id,
    fecha: gasto.fecha,
    concepto: gasto.concepto,
    comercio: gasto.comercio,
    importe: gasto.importe,
    pendiente: desdeCentimos(aCentimos(gasto.importe) - aCentimos(devuelto) + propio),
    categoria_id: gasto.categoria_id ?? '',
    cuenta_id: gasto.cuenta_id,
    puntuacion: 0,
    motivo: 'reciente',
  };
}

/**
 * Formulario de movimiento. Orden: Importe → Concepto → Categoría → Cuenta → Método → Fecha →
 * Notas. En una devolución, el «Gasto original» (obligatorio) va justo después del concepto y no
 * hay selector de categoría: se hereda del gasto. Valida al salir de cada campo o al enviar,
 * nunca antes de escribir. Un ajuste NUEVO se hace por saldo real (AjusteSaldoReal); al editar
 * un ajuste existente se corrige su importe y sentido.
 */
export function FormularioMovimiento({
  inicial,
  cuentas,
  categorias,
  hoy,
  original,
  devueltoOriginal = null,
  onGuardado,
  onCancelar,
}: Props) {
  const t = useT('movimientos');
  const nombreCuenta = useNombreCuenta();
  const nombreCategoria = useNombreCategoria();
  const { locale } = useIdioma();
  const [crear] = useMovimientosCrearMutation();
  const [actualizar] = useMovimientosActualizarMutation();
  const [registrarDevoluciones] = useMovimientosRegistrarDevolucionesMutation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  // Si el usuario elige la cuenta (o la categoría) a mano, nada la cambia por él.
  const [cuentaTocada, setCuentaTocada] = useState(original !== undefined);
  const [metodoTocado, setMetodoTocado] = useState(original !== undefined);
  const [categoriaTocada, setCategoriaTocada] = useState(original !== undefined);

  // El esquema depende de datos que cambian (gasto elegido, catálogos): el resolver usa siempre el último.
  const esquemaRef = useRef<ReturnType<typeof crearEsquemaMovimiento> | null>(null);
  const resolver = useMemo<Resolver<ValoresMovimiento, unknown, PayloadMovimiento>>(
    () => (valores, contexto, opciones) => {
      if (esquemaRef.current === null) return { values: {}, errors: {} };
      return zodResolver(esquemaRef.current)(valores, contexto, opciones);
    },
    [],
  );

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ValoresMovimiento, unknown, PayloadMovimiento>({
    defaultValues: inicial,
    resolver,
    // Errores al salir del campo o al enviar; después se corrigen mientras se escribe.
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  // Al crear, el importe recibe el foco (el teclado decimal sale directamente en el móvil).
  useEffect(() => {
    if (original === undefined && inicial.tipo !== 'ajuste') setFocus('importe');
  }, [original, inicial.tipo, setFocus]);

  const [tipo, categoriaId, cuentaId, destinoId, devolucionDe, concepto, fecha, importeTexto] = useWatch({
    control,
    name: ['tipo', 'categoria_id', 'cuenta_id', 'cuenta_destino_id', 'devolucion_de', 'concepto', 'fecha', 'importe'],
  });

  // Devolución: gasto elegido. Al editar una vinculada, se parte de su gasto actual.
  const vinculadoAntes = original?.tipo === 'devolucion' ? original.devolucion_de : null;
  const gastoActualQ = useMovimientosObtenerQuery(vinculadoAntes ?? '', { skip: vinculadoAntes === null });
  const devueltoActualQ = useMovimientosDevolucionesDeQuery(vinculadoAntes ?? '', { skip: vinculadoAntes === null });
  const [gastoEscogido, setGastoEscogido] = useState<GastoDevolvible | null>(null);
  const gastoInicial = useMemo(
    () => gastoDeLaDevolucion(gastoActualQ.data, devueltoActualQ.data?.total, original),
    [gastoActualQ.data, devueltoActualQ.data?.total, original],
  );
  const gastoElegido = gastoEscogido ?? (gastoInicial?.id === devolucionDe ? gastoInicial : null);
  const vinculado = tipo === 'devolucion' && gastoElegido?.id === devolucionDe ? gastoElegido : null;

  // Devolución NUEVA: uno o varios gastos (una devolución por gasto) y, si sobra, un ingreso
  // (reglas, sección 3, cambio del 02/11/2026). Al editar se edita solo esa fila, como siempre.
  const varios = tipo === 'devolucion' && original === undefined;
  const [seleccion, setSeleccion] = useState<GastoDevolvible[]>([]);
  const [manuales, setManuales] = useState<Record<string, string>>({});
  const [importeAuto, setImporteAuto] = useState(false);
  // Se intentó guardar con un reparto que no cuadra: el aviso se queda hasta que cuadre.
  const [repartoIntentado, setRepartoIntentado] = useState(false);
  const categoriasIngreso = categorias.filter((c) => c.tipo === 'ingreso' && !c.archivada);
  const otrosIngresos = categoriasIngreso.find((c) => c.clave === 'otros_ingresos')?.id ?? '';
  const [categoriaSobranteElegida, setCategoriaSobrante] = useState<string | null>(null);
  const categoriaSobrante = categoriaSobranteElegida ?? otrosIngresos;
  const total = importePositivo(importeTexto, locale);
  const reparto = varios
    ? repartirDevolucion(
        total,
        seleccion,
        Object.fromEntries(Object.entries(manuales).map(([id, texto]) => [id, importePositivo(texto, locale)])),
      )
    : null;

  const pendiente = varios ? null : (vinculado?.pendiente ?? null);
  const fechaGasto = varios
    ? (seleccion.map((g) => g.fecha).sort().at(-1) ?? null)
    : (vinculado?.fecha ?? null);

  const esquema = useMemo(
    () =>
      crearEsquemaMovimiento({
        t,
        locale,
        hoy,
        cuentas,
        categorias,
        nombreCuenta,
        devueltoOriginal,
        tipoOriginal: original?.tipo ?? null,
        pendienteGastoOriginal: pendiente,
        fechaGastoOriginal: fechaGasto,
      }),
    [t, locale, hoy, cuentas, categorias, nombreCuenta, devueltoOriginal, original?.tipo, pendiente, fechaGasto],
  );
  useLayoutEffect(() => {
    esquemaRef.current = esquema;
  }, [esquema]);

  // Categorías: las más usadas primero (categorias_mas_usadas).
  const tipoCat = tipoCategoria(tipo);
  const usadas = useMovimientosCategoriasUsadasQuery(tipoCat, { skip: !eligeCategoria(tipo) });
  const categoriasTipo = ordenarPorUso(
    categorias.filter((c) => c.tipo === tipoCat && (!c.archivada || c.id === inicial.categoria_id)),
    usadas.data,
  );

  // Sugerencia de categoría por el concepto (sugerir_categoria), tras una pausa al escribir.
  const [conceptoPedido, setConceptoPedido] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setConceptoPedido(concepto.trim()), ESPERA_SUGERENCIA_MS);
    return () => window.clearTimeout(id);
  }, [concepto]);
  const sugerenciaQ = useMovimientosSugerirCategoriaQuery(
    { concepto: conceptoPedido, tipo: tipoCat },
    { skip: !eligeCategoria(tipo) || categoriaTocada || conceptoPedido.length < 3 },
  );
  const sugerida =
    eligeCategoria(tipo) &&
    !categoriaTocada &&
    sugerenciaQ.data != null &&
    categoriasTipo.some((c) => c.id === sugerenciaQ.data)
      ? sugerenciaQ.data
      : null;
  useEffect(() => {
    if (sugerida !== null && getValues('categoria_id') !== sugerida) {
      setValue('categoria_id', sugerida, { shouldValidate: false });
    }
  }, [sugerida, getValues, setValue]);

  const abiertas = cuentas.filter(cuentaUsable);
  const tipoBloqueado = original?.tipo === 'gasto' && devueltoOriginal !== null && devueltoOriginal !== '0.00';
  // Devolución antigua sin vínculo: solo se puede guardar vinculándola (validar_devolucion).
  const sinVincular = tipo === 'devolucion' && original?.tipo === 'devolucion' && original.devolucion_de === null && devolucionDe === '';
  const fechasInicio = [cuentaId, tipo === 'traspaso' ? destinoId : '']
    .map((id) => cuentas.find((c) => c.id === id)?.fecha_inicial)
    .filter((f): f is string => f !== undefined)
    .sort();
  const fechaMinima = fechasInicio[fechasInicio.length - 1];
  const ayer = sumarDias(hoy, -1);

  const cambiarTipo = (nuevo: TipoMovimiento) => {
    setValue('tipo', nuevo);
    const cat = categorias.find((c) => c.id === categoriaId);
    if (eligeCategoria(nuevo) && cat !== undefined && cat.tipo !== tipoCategoria(nuevo)) {
      setValue('categoria_id', '');
      setCategoriaTocada(false);
    }
    if (nuevo !== 'devolucion') {
      setValue('devolucion_de', '');
      setGastoEscogido(null);
      setSeleccion([]);
      setManuales({});
    }
    if (nuevo === 'traspaso' && destinoId === cuentaId) setValue('cuenta_destino_id', '');
    // Método por defecto según el tipo (tarjeta en gastos; sin indicar en el resto), si no lo eligió el usuario.
    if (!metodoTocado) setValue('metodo', nuevo === 'gasto' ? 'tarjeta' : '');
  };

  /**
   * Devolución: el usuario elige (o confirma una sugerencia de) su gasto original. Nunca se elige
   * solo. Se rellena la cuenta (sigue siendo editable) y, si el importe está vacío, lo pendiente.
   * La categoría la pone la base (la del gasto); aquí solo se muestra.
   */
  const elegirGastoOriginal = (g: GastoDevolvible) => {
    setGastoEscogido(g);
    setValue('devolucion_de', g.id, { shouldValidate: true });
    setValue('categoria_id', g.categoria_id);
    if (cuentaUsable(cuentas.find((c) => c.id === g.cuenta_id))) {
      setValue('cuenta_id', g.cuenta_id);
      setCuentaTocada(true);
    }
    if (getValues('importe').trim() === '') setValue('importe', importeParaEditar(g.pendiente, locale));
  };

  /**
   * Devolución nueva: marca o desmarca un gasto (en el orden en que se marcan). Nunca se marca
   * solo. El primero rellena la cuenta (editable). Si el importe está vacío (o lo rellenamos
   * nosotros), pasa a ser lo pendiente de todos los marcados; si lo escribió el usuario, se reparte.
   */
  const alternarGasto = (g: GastoDevolvible) => {
    const marcado = seleccion.some((x) => x.id === g.id);
    const nueva = marcado ? seleccion.filter((x) => x.id !== g.id) : [...seleccion, g];
    setSeleccion(nueva);
    if (marcado) {
      setManuales((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== g.id)));
    }
    setValue('devolucion_de', nueva[0]?.id ?? '', { shouldValidate: nueva.length > 0 });
    const primero = nueva[0];
    if (!marcado && nueva.length === 1 && primero && cuentaUsable(cuentas.find((c) => c.id === primero.cuenta_id))) {
      setValue('cuenta_id', primero.cuenta_id);
      setCuentaTocada(true);
    }
    if (getValues('importe').trim() === '' || importeAuto) {
      const suma = nueva.reduce((s, x) => s + aCentimos(x.pendiente), 0n);
      setValue('importe', suma > 0n ? importeParaEditar(desdeCentimos(suma), locale) : '');
      setImporteAuto(suma > 0n);
    }
  };

  const enviar = handleSubmit(async (payload) => {
    setErrorEnvio(null);
    if (varios) {
      if (!repartoValido(reparto)) {
        setRepartoIntentado(true);
        return;
      }
      const r = await registrarDevoluciones({
        fecha: payload.fecha,
        cuenta: payload.cuenta_id,
        concepto: payload.concepto,
        metodo: payload.metodo,
        notas: payload.notas,
        repartos: reparto.lineas.map((l) => ({ gasto: l.id, importe: l.importe ?? '' })),
        sobrante: reparto.sobrante,
        categoriaSobrante: reparto.sobrante === null || categoriaSobrante === '' ? null : categoriaSobrante,
      });
      if ('error' in r) {
        setErrorEnvio(t(claveErrorMovimiento(r.error)));
        return;
      }
      toast.success(t('form.creado'));
      onGuardado();
      return;
    }
    const r = original === undefined ? await crear(payload) : await actualizar({ id: original.id, payload });
    if ('error' in r) {
      setErrorEnvio(t(claveErrorMovimiento(r.error)));
      return;
    }
    toast.success(t(original === undefined ? 'form.creado' : 'form.actualizado'));
    onGuardado();
  });

  const selectorTipo = (
    <div className="flex flex-col gap-1.5">
      <SelectorTipo
        valor={tipo}
        deshabilitado={tipoBloqueado}
        onChange={(v) => {
          if (v !== tipo) cambiarTipo(v);
        }}
      />
      {tipoBloqueado && <p className="text-xs text-apagado">{t('form.tipoBloqueado')}</p>}
      {errors.tipo?.message !== undefined && <p className="text-xs font-medium text-negativo">{errors.tipo.message}</p>}
    </div>
  );

  // Ajuste nuevo: por saldo real (la diferencia la calcula la base).
  if (tipo === 'ajuste' && original === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {selectorTipo}
        <AjusteSaldoReal cuentas={cuentas} cuentaInicial={cuentaId} onGuardado={onGuardado} onCancelar={onCancelar} />
      </div>
    );
  }

  const etiquetaCuenta = {
    gasto: t('form.saleDe'),
    ingreso: t('form.entraEn'),
    devolucion: t('form.entraEn'),
    traspaso: t('form.desde'),
    ajuste: t('form.cuentaAjuste'),
  }[tipo];
  const aviso = MENSAJE_TIPO[tipo];

  // Lo que queda por devolver del gasto: al editar, el vinculado; en una nueva, si hay uno solo.
  const ayudaPendiente = varios ? (seleccion.length === 1 ? (seleccion[0]?.pendiente ?? null) : null) : pendiente;
  const nombreCategoriaDe = (id: string) => {
    const c = categorias.find((x) => x.id === id);
    return c ? nombreCategoria(c) : t('meta.sinCategoria');
  };
  const textoGasto = (g: GastoDevolvible) =>
    g.comercio !== null && g.comercio !== '' && g.comercio !== g.concepto ? `${g.concepto} · ${g.comercio}` : g.concepto;
  const datosGasto = (g: GastoDevolvible) =>
    [
      formatearFecha(g.fecha, locale, 'corta'),
      t('form.candidatoImporte', { importe: formatearEuros(g.importe, locale) }),
      t('form.candidatoQueda', { pendiente: formatearEuros(g.pendiente, locale) }),
    ].join(' · ');
  const resumenSeleccion =
    seleccion.length === 1 && seleccion[0] ? (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-apagado">{t('form.gastoElegido')}</span>
        <span className="font-medium text-texto">{textoGasto(seleccion[0])}</span>
        <span className="text-xs text-apagado tabular-nums">{datosGasto(seleccion[0])}</span>
        <span className="text-xs text-apagado">
          {t('form.categoriaHeredada', { categoria: nombreCategoriaDe(seleccion[0].categoria_id) })}
        </span>
      </div>
    ) : (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-apagado">{t('form.gastosElegidos', { n: seleccion.length })}</span>
        <ul className="flex flex-col gap-1">
          {seleccion.map((g) => (
            <li key={g.id} className="flex flex-col">
              <span className="font-medium text-texto">{textoGasto(g)}</span>
              <span className="text-xs text-apagado tabular-nums">
                {datosGasto(g)} · {nombreCategoriaDe(g.categoria_id)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  // En un traspaso se ve el saldo de cada cuenta («BBVA · 98,32 €», de v_saldos).
  const opcionCuenta = (c: Cuenta) =>
    tipo === 'traspaso' && c.valor !== null ? `${nombreCuenta(c)} · ${formatearEuros(c.valor, locale)}` : nombreCuenta(c);

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-4">
      {selectorTipo}

      {aviso !== undefined && (
        <p role="note" className="flex gap-2 rounded-xl bg-superficie-2 px-3 py-2.5 text-sm text-apagado">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t(aviso)}
        </p>
      )}

      {sinVincular && (
        <p
          role="note"
          className="flex gap-2 rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2.5 text-sm text-aviso"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('form.devolucionSinVincular')}
        </p>
      )}

      {tipo === 'ajuste' && (
        <p
          role="note"
          className="flex gap-2 rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2.5 text-sm text-aviso"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('form.avisoAjuste')}
        </p>
      )}

      <Controller
        name="importe"
        control={control}
        render={({ field, fieldState }) => (
          <MoneyInput
            label={t('form.importe')}
            value={field.value}
            onChange={(texto) => {
              // Normalizar al salir no cuenta como escribirlo el usuario.
              if (importePositivo(texto, locale) !== importePositivo(field.value, locale)) setImporteAuto(false);
              field.onChange(texto);
            }}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
            error={fieldState.error?.message}
            ayuda={
              ayudaPendiente !== null
                ? t('form.gastoOriginalQueda', { pendiente: formatearEuros(ayudaPendiente, locale) })
                : undefined
            }
            className="[&_input]:h-14 [&_input]:text-2xl [&_input]:font-semibold [&_input]:tabular-nums"
          />
        )}
      />

      {tipo === 'ajuste' && (
        <Controller
          name="sentido"
          control={control}
          render={({ field }) => (
            <SegmentedControl
              etiqueta={t('form.sentido')}
              anchoCompleto
              valor={field.value}
              onChange={field.onChange}
              opciones={[
                { valor: 'suma', etiqueta: t('sentido.suma') },
                { valor: 'resta', etiqueta: t('sentido.resta') },
              ]}
            />
          )}
        />
      )}

      <Input
        label={t('form.concepto')}
        maxLength={CONCEPTO_MAXIMO}
        autoComplete="off"
        error={errors.concepto?.message}
        {...register('concepto')}
      />

      {varios && (
        <>
          <SelectorGastoOriginal
            multiple
            seleccion={seleccion}
            onAlternar={alternarGasto}
            resumen={resumenSeleccion}
            concepto={concepto}
            importe={importeTexto}
            fecha={fecha}
            excluir={null}
            categorias={categorias}
            error={errors.devolucion_de?.message}
          />
          {seleccion.length > 0 && (
            <RepartoDevolucion
              seleccion={seleccion}
              reparto={reparto}
              total={total}
              manuales={manuales}
              onImporte={(id, texto) => setManuales((m) => ({ ...m, [id]: texto }))}
              onRepartir={() => setManuales({})}
              onQuitar={alternarGasto}
              categoriasIngreso={categoriasIngreso}
              categoriaSobrante={categoriaSobrante}
              onCategoriaSobrante={setCategoriaSobrante}
            />
          )}
        </>
      )}

      {tipo === 'devolucion' && !varios && (
        <SelectorGastoOriginal
          valor={devolucionDe}
          elegido={vinculado}
          concepto={concepto}
          importe={importeTexto}
          fecha={fecha}
          excluir={original?.id ?? null}
          categorias={categorias}
          error={errors.devolucion_de?.message}
          onElegir={elegirGastoOriginal}
        />
      )}

      {eligeCategoria(tipo) && (
        <Controller
          name="categoria_id"
          control={control}
          render={({ field, fieldState }) => (
            <SelectorCategoria
              etiqueta={t('form.categoria')}
              categorias={categoriasTipo}
              valor={field.value}
              sugerida={sugerida}
              ayuda={sugerida !== null && field.value === sugerida ? t('form.categoriaSugeridaAyuda') : undefined}
              error={fieldState.error?.message}
              onChange={(id) => {
                setCategoriaTocada(true);
                field.onChange(id);
              }}
            />
          )}
        />
      )}

      <Select
        label={etiquetaCuenta}
        error={errors.cuenta_id?.message}
        {...register('cuenta_id', {
          onChange: () => {
            setCuentaTocada(true);
          },
        })}
      >
        <option value="">{t('form.elegirCuenta')}</option>
        {abiertas.map((c) => (
          <option key={c.id} value={c.id}>
            {opcionCuenta(c)}
          </option>
        ))}
      </Select>

      {tipo === 'traspaso' && (
        <Select label={t('form.hacia')} error={errors.cuenta_destino_id?.message} {...register('cuenta_destino_id')}>
          <option value="">{t('form.elegirCuenta')}</option>
          {abiertas.map((c) => (
            <option key={c.id} value={c.id} disabled={c.id === cuentaId}>
              {opcionCuenta(c)}
            </option>
          ))}
        </Select>
      )}

      {usaMetodo(tipo) && (
        <Select
          label={t('form.metodo')}
          opcional={tipo !== 'gasto'}
          error={errors.metodo?.message}
          {...register('metodo', {
            onChange: (e: { target: { value: string } }) => {
              setMetodoTocado(true);
              if (!cuentaTocada) {
                setValue('cuenta_id', cuentaPorDefecto(cuentas, e.target.value as MetodoPago | ''));
              }
            },
          })}
        >
          <option value="">{tipo === 'gasto' ? t('validacion.metodo') : t('form.sinMetodo')}</option>
          {METODOS.map((m) => (
            <option key={m} value={m}>
              {t(`metodo.${m}`)}
            </option>
          ))}
        </Select>
      )}

      <div className="flex flex-col gap-2">
        <Input
          label={t('form.fecha')}
          type="date"
          max={hoy}
          min={fechaMinima}
          ayuda={t('form.fechaAyuda')}
          error={errors.fecha?.message}
          // iOS pinta el input de fecha con su propio ancho y se sale de la pantalla.
          className="min-w-0 [&_input]:w-full [&_input]:max-w-full [&_input]:min-w-0 [&_input]:appearance-none"
          {...register('fecha')}
        />
        <div role="group" aria-label={t('form.atajosFecha')} className="flex gap-2">
          {[
            { valor: hoy, etiqueta: t('form.hoy') },
            { valor: ayer, etiqueta: t('form.ayer') },
          ].map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={fecha === o.valor}
              onClick={() => setValue('fecha', o.valor, { shouldValidate: true })}
              className={cx(
                'area-tactil rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                fecha === o.valor
                  ? 'border-acento bg-acento-suave font-semibold text-texto'
                  : 'border-borde-input text-texto hover:bg-superficie-2',
              )}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <Field
        label={tipo === 'ajuste' ? t('form.notaAjuste') : t('form.notas')}
        opcional={tipo !== 'ajuste'}
        ayuda={tipo === 'ajuste' ? t('form.notaAjusteAyuda') : undefined}
        error={errors.notas?.message}
      >
        {(props) => (
          <textarea
            rows={3}
            maxLength={NOTAS_MAXIMO}
            className={cx(clasesControl, 'h-auto min-h-20 py-2.5')}
            {...register('notas')}
            {...props}
          />
        )}
      </Field>

      {varios && repartoIntentado && !repartoValido(reparto) && (
        <p role="alert" className="rounded-xl bg-negativo-suave px-3 py-2.5 text-sm font-medium text-negativo">
          {t('form.repartoRevisa')}
        </p>
      )}

      {errorEnvio !== null && (
        <p role="alert" className="rounded-xl bg-negativo-suave px-3 py-2.5 text-sm font-medium text-negativo">
          {errorEnvio}
        </p>
      )}

      <PieFormulario
        cancelar={t('form.cancelar')}
        guardar={t('form.guardar')}
        cargando={isSubmitting}
        onCancelar={onCancelar}
      />
    </form>
  );
}
