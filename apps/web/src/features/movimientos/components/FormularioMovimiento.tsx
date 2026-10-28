import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Info, TriangleAlert } from 'lucide-react';
import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { sumarDias } from '@/shared/lib/fechas';
import { Field, Input, MoneyInput, SegmentedControl, Select, clasesControl, importeParaEditar } from '@/shared/ui';
import { useMovimientosActualizarMutation, useMovimientosCrearMutation } from '../api/movimientosApi';
import {
  useMovimientosCategoriasUsadasQuery,
  useMovimientosGastosDevolviblesQuery,
  useMovimientosSugerirCategoriaQuery,
} from '../api/sqlApi';
import { claveErrorMovimiento } from '../api/errores';
import { diaCorto } from '../lib/presentacion';
import { METODOS, type MetodoPago, type Movimiento, type TipoMovimiento } from '../lib/tipos';
import {
  CONCEPTO_MAXIMO,
  NOTAS_MAXIMO,
  crearEsquemaMovimiento,
  cuentaPorDefecto,
  cuentaUsable,
  ordenarPorUso,
  tipoCategoria,
  usaCategoria,
  usaMetodo,
  type PayloadMovimiento,
  type ValoresMovimiento,
} from '../schemas/movimiento';
import { AjusteSaldoReal, PieFormulario } from './AjusteSaldoReal';
import { SelectorCategoria, SelectorTipo } from './SelectoresFormulario';

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
 * Formulario de movimiento. Orden: Importe → Concepto → Categoría → Cuenta → Método → Fecha →
 * Notas (en una devolución, antes de todo, el «Gasto original»). Valida al salir de cada campo o
 * al enviar, nunca antes de escribir. Un ajuste NUEVO se hace por saldo real (AjusteSaldoReal);
 * al editar un ajuste existente se corrige su importe y sentido.
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
  const { locale } = useIdioma();
  const [crear] = useMovimientosCrearMutation();
  const [actualizar] = useMovimientosActualizarMutation();
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
  // En una devolución se empieza por el gasto original.
  useEffect(() => {
    if (original === undefined && inicial.tipo !== 'devolucion' && inicial.tipo !== 'ajuste') setFocus('importe');
  }, [original, inicial.tipo, setFocus]);

  const [tipo, categoriaId, cuentaId, destinoId, devolucionDe, concepto, fecha] = useWatch({
    control,
    name: ['tipo', 'categoria_id', 'cuenta_id', 'cuenta_destino_id', 'devolucion_de', 'concepto', 'fecha'],
  });

  const gastosQ = useMovimientosGastosDevolviblesQuery({ excluir: original?.id ?? null }, { skip: tipo !== 'devolucion' });
  const gastos = useMemo(() => gastosQ.data ?? [], [gastosQ.data]);
  const pendiente = gastos.find((g) => g.id === devolucionDe)?.pendiente ?? null;

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
      }),
    [t, locale, hoy, cuentas, categorias, nombreCuenta, devueltoOriginal, original?.tipo, pendiente],
  );
  useLayoutEffect(() => {
    esquemaRef.current = esquema;
  }, [esquema]);

  // Categorías: las más usadas primero (categorias_mas_usadas).
  const tipoCat = tipoCategoria(tipo);
  const usadas = useMovimientosCategoriasUsadasQuery(tipoCat, { skip: !usaCategoria(tipo) });
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
    { skip: !usaCategoria(tipo) || categoriaTocada || conceptoPedido.length < 3 },
  );
  const sugerida =
    !categoriaTocada && sugerenciaQ.data != null && categoriasTipo.some((c) => c.id === sugerenciaQ.data)
      ? sugerenciaQ.data
      : null;
  useEffect(() => {
    if (sugerida !== null && getValues('categoria_id') !== sugerida) {
      setValue('categoria_id', sugerida, { shouldValidate: false });
    }
  }, [sugerida, getValues, setValue]);

  const abiertas = cuentas.filter(cuentaUsable);
  const tipoBloqueado = original?.tipo === 'gasto' && devueltoOriginal !== null && devueltoOriginal !== '0.00';
  const fechasInicio = [cuentaId, tipo === 'traspaso' ? destinoId : '']
    .map((id) => cuentas.find((c) => c.id === id)?.fecha_inicial)
    .filter((f): f is string => f !== undefined)
    .sort();
  const fechaMinima = fechasInicio[fechasInicio.length - 1];
  const ayer = sumarDias(hoy, -1);

  const cambiarTipo = (nuevo: TipoMovimiento) => {
    setValue('tipo', nuevo);
    const cat = categorias.find((c) => c.id === categoriaId);
    if (usaCategoria(nuevo) && cat !== undefined && cat.tipo !== tipoCategoria(nuevo)) {
      setValue('categoria_id', '');
      setCategoriaTocada(false);
    }
    if (nuevo !== 'devolucion') setValue('devolucion_de', '');
    if (nuevo === 'traspaso' && destinoId === cuentaId) setValue('cuenta_destino_id', '');
    // Método por defecto según el tipo (tarjeta en gastos; sin indicar en el resto), si no lo eligió el usuario.
    if (!metodoTocado) setValue('metodo', nuevo === 'gasto' ? 'tarjeta' : '');
  };

  /** Devolución: al elegir el gasto original se rellenan categoría y cuenta, y se sugiere lo pendiente. */
  const elegirGastoOriginal = (id: string) => {
    setValue('devolucion_de', id);
    const g = gastos.find((x) => x.id === id);
    if (g === undefined) return;
    if (categorias.some((c) => c.id === g.categoria_id && c.tipo === 'gasto')) {
      setValue('categoria_id', g.categoria_id);
      setCategoriaTocada(true);
    }
    if (cuentaUsable(cuentas.find((c) => c.id === g.cuenta_id))) {
      setValue('cuenta_id', g.cuenta_id);
      setCuentaTocada(true);
    }
    if (getValues('importe').trim() === '') setValue('importe', importeParaEditar(g.pendiente, locale));
  };

  const enviar = handleSubmit(async (payload) => {
    setErrorEnvio(null);
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

      {tipo === 'devolucion' && (
        <Select
          label={t('form.gastoOriginal')}
          opcional
          ayuda={
            pendiente !== null
              ? t('form.gastoOriginalQueda', { pendiente: formatearEuros(pendiente, locale) })
              : t('form.gastoOriginalAyuda')
          }
          error={errors.devolucion_de?.message}
          {...register('devolucion_de', { onChange: (e: { target: { value: string } }) => elegirGastoOriginal(e.target.value) })}
        >
          <option value="">{t('form.gastoOriginalNinguno')}</option>
          {original?.devolucion_de != null && !gastos.some((g) => g.id === original.devolucion_de) && (
            <option value={original.devolucion_de}>{t('form.gastoOriginal')}</option>
          )}
          {gastos.map((g) => {
            const datos = {
              fecha: diaCorto(g.fecha, locale),
              concepto: g.concepto,
              importe: formatearEuros(g.importe, locale),
              pendiente: formatearEuros(g.pendiente, locale),
            };
            return (
              <option key={g.id} value={g.id}>
                {g.pendiente === g.importe ? t('form.gastoOriginalOpcion', datos) : t('form.gastoOriginalPendiente', datos)}
              </option>
            );
          })}
        </Select>
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
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
            error={fieldState.error?.message}
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

      {usaCategoria(tipo) && (
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
