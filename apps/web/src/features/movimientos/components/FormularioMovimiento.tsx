import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Info, TriangleAlert } from 'lucide-react';
import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { Button, Field, Input, MoneyInput, SegmentedControl, Select, clasesControl } from '@/shared/ui';
import {
  useMovimientosActualizarMutation,
  useMovimientosCrearMutation,
  useMovimientosGastosDevolviblesQuery,
} from '../api/movimientosApi';
import { claveErrorMovimiento } from '../api/errores';
import { diaCorto } from '../lib/presentacion';
import { METODOS, type MetodoPago, type Movimiento, type TipoMovimiento } from '../lib/tipos';
import {
  CONCEPTO_MAXIMO,
  NOTAS_MAXIMO,
  crearEsquemaMovimiento,
  cuentaPorDefecto,
  cuentaUsable,
  tipoCategoria,
  usaCategoria,
  usaMetodo,
  type PayloadMovimiento,
  type ValoresMovimiento,
} from '../schemas/movimiento';

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
  const nombreCategoria = useNombreCategoria();
  const nombreCuenta = useNombreCuenta();
  const { locale } = useIdioma();
  const [crear] = useMovimientosCrearMutation();
  const [actualizar] = useMovimientosActualizarMutation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  // Si el usuario elige la cuenta a mano, cambiar el método ya no la cambia.
  const [cuentaTocada, setCuentaTocada] = useState(original !== undefined);
  const [metodoTocado, setMetodoTocado] = useState(original !== undefined);

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
    formState: { errors, isSubmitting },
  } = useForm<ValoresMovimiento, unknown, PayloadMovimiento>({ defaultValues: inicial, resolver });

  const [tipo, categoriaId, cuentaId, destinoId, devolucionDe] = useWatch({
    control,
    name: ['tipo', 'categoria_id', 'cuenta_id', 'cuenta_destino_id', 'devolucion_de'],
  });

  const gastosQ = useMovimientosGastosDevolviblesQuery(
    { categoriaId, excluir: original?.id ?? null },
    { skip: tipo !== 'devolucion' || categoriaId === '' },
  );
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

  const abiertas = cuentas.filter(cuentaUsable);
  const categoriasTipo = categorias.filter(
    (c) => c.tipo === tipoCategoria(tipo) && (!c.archivada || c.id === inicial.categoria_id),
  );
  const tipoBloqueado = original?.tipo === 'gasto' && devueltoOriginal !== null && devueltoOriginal !== '0.00';
  const fechasInicio = [cuentaId, tipo === 'traspaso' ? destinoId : '']
    .map((id) => cuentas.find((c) => c.id === id)?.fecha_inicial)
    .filter((f): f is string => f !== undefined)
    .sort();
  const fechaMinima = fechasInicio[fechasInicio.length - 1];

  const cambiarTipo = (nuevo: TipoMovimiento) => {
    setValue('tipo', nuevo);
    const cat = categorias.find((c) => c.id === categoriaId);
    if (usaCategoria(nuevo) && cat !== undefined && cat.tipo !== tipoCategoria(nuevo)) setValue('categoria_id', '');
    if (nuevo !== 'devolucion') setValue('devolucion_de', '');
    if (nuevo === 'traspaso' && destinoId === cuentaId) setValue('cuenta_destino_id', '');
    // Método por defecto según el tipo (tarjeta en gastos; sin indicar en el resto), si no lo eligió el usuario.
    if (!metodoTocado) setValue('metodo', nuevo === 'gasto' ? 'tarjeta' : '');
  };

  const enviar = handleSubmit(
    async (payload) => {
      setErrorEnvio(null);
      const r =
        original === undefined ? await crear(payload) : await actualizar({ id: original.id, payload });
      if ('error' in r) {
        setErrorEnvio(t(claveErrorMovimiento(r.error)));
        return;
      }
      toast.success(t(original === undefined ? 'form.creado' : 'form.actualizado'));
      onGuardado();
    },
  );

  const etiquetaCuenta = {
    gasto: t('form.saleDe'),
    ingreso: t('form.entraEn'),
    devolucion: t('form.entraEn'),
    traspaso: t('form.desde'),
    ajuste: t('form.cuentaAjuste'),
  }[tipo];
  const aviso = MENSAJE_TIPO[tipo];

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SegmentedControl<TipoMovimiento>
          etiqueta={t('tipo.etiqueta')}
          anchoCompleto
          tamano="sm"
          valor={tipo}
          onChange={(v) => {
            if (!tipoBloqueado) cambiarTipo(v);
          }}
          opciones={[
            { valor: 'gasto', etiqueta: t('tipo.gasto') },
            { valor: 'ingreso', etiqueta: t('tipo.ingreso') },
            {
              valor: 'devolucion',
              etiqueta: (
                <>
                  <span className="sm:hidden" aria-hidden="true">
                    {t('tipoCorto.devolucion')}
                  </span>
                  <span className="max-sm:sr-only">{t('tipo.devolucion')}</span>
                </>
              ),
            },
            { valor: 'traspaso', etiqueta: t('tipo.traspaso') },
            { valor: 'ajuste', etiqueta: t('tipo.ajuste') },
          ]}
        />
        {tipoBloqueado && <p className="text-xs text-apagado">{t('form.tipoBloqueado')}</p>}
        {errors.tipo?.message !== undefined && (
          <p className="text-xs font-medium text-negativo">{errors.tipo.message}</p>
        )}
      </div>

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
          />
        )}
      />

      {tipo === 'ajuste' && (
        <>
          <p
            role="note"
            className="flex gap-2 rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2.5 text-sm text-aviso"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('form.avisoAjuste')}
          </p>
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
        </>
      )}

      {aviso !== undefined && (
        <p role="note" className="flex gap-2 rounded-xl bg-superficie-2 px-3 py-2.5 text-sm text-apagado">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t(aviso)}
        </p>
      )}

      {usaCategoria(tipo) && (
        <Select
          label={t('form.categoria')}
          error={errors.categoria_id?.message}
          {...register('categoria_id', { onChange: () => setValue('devolucion_de', '') })}
        >
          <option value="">{t('form.elegirCategoria')}</option>
          {categoriasTipo.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icono ? `${c.icono} ${nombreCategoria(c)}` : nombreCategoria(c)}
            </option>
          ))}
        </Select>
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
            {nombreCuenta(c)}
          </option>
        ))}
      </Select>

      {tipo === 'traspaso' && (
        <Select label={t('form.hacia')} error={errors.cuenta_destino_id?.message} {...register('cuenta_destino_id')}>
          <option value="">{t('form.elegirCuenta')}</option>
          {abiertas.map((c) => (
            <option key={c.id} value={c.id} disabled={c.id === cuentaId}>
              {nombreCuenta(c)}
            </option>
          ))}
        </Select>
      )}

      {tipo === 'devolucion' && (
        <Select
          label={t('form.gastoOriginal')}
          opcional
          ayuda={categoriaId === '' ? t('form.gastoOriginalElegirCategoria') : t('form.gastoOriginalAyuda')}
          disabled={categoriaId === ''}
          error={errors.devolucion_de?.message}
          {...register('devolucion_de')}
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
            const completo = g.pendiente === g.importe;
            return (
              <option key={g.id} value={g.id} disabled={g.pendiente === '0.00' && g.id !== inicial.devolucion_de}>
                {completo ? t('form.gastoOriginalOpcion', datos) : t('form.gastoOriginalPendiente', datos)}
              </option>
            );
          })}
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

      <Input
        label={t('form.fecha')}
        type="date"
        max={hoy}
        min={fechaMinima}
        ayuda={t('form.fechaAyuda')}
        error={errors.fecha?.message}
        {...register('fecha')}
      />

      <Input
        label={t('form.concepto')}
        maxLength={CONCEPTO_MAXIMO}
        autoComplete="off"
        error={errors.concepto?.message}
        {...register('concepto')}
      />

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

      <div className="flex gap-2 pt-1">
        <Button variante="secundario" onClick={onCancelar} className="flex-1 sm:flex-none">
          {t('form.cancelar')}
        </Button>
        <Button type="submit" tamano="lg" cargando={isSubmitting} className="flex-1">
          {t('form.guardar')}
        </Button>
      </div>
    </form>
  );
}
