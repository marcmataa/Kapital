import { useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ErrorApi } from '@/app/api';
import { useCrearObjetivoMutation, useListarCategoriasQuery, useListarObjetivosQuery } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { nombreCategoria } from '@/shared/lib/categorias';
import { esquemaImporte } from '@/shared/lib/esquemas';
import { cx } from '@/shared/lib/cx';
import { Button, MoneyInput, SegmentedControl, Select, importeParaEditar } from '@/shared/ui';
import { useActualizarObjetivoMutation, type ObjetivoEditado } from '../api/inicioApi';

type TipoObjetivo = 'ahorro_mensual' | 'limite_categoria';

interface Props {
  /** Se llama tras guardar el objetivo (la lista se refresca sola por la etiqueta 'Objetivos'). */
  onHecho: () => void;
  onCancelar: () => void;
  /** Objetivo que se edita (todos sus campos). Sin él, el formulario da de alta uno nuevo. */
  objetivo?: ObjetivoEditado | undefined;
  /** Sin tarjeta propia y con botones de tamaño normal (dentro de un modal). */
  plano?: boolean;
  /** Información extra bajo la categoría de un límite (en Configuración, su media mensual). */
  ayudaCategoria?: (categoriaId: string) => ReactNode;
}

function esErrorApi(e: unknown): e is ErrorApi {
  return typeof e === 'object' && e !== null && typeof (e as { codigo?: unknown }).codigo === 'string';
}

/**
 * Alta o edición de un objetivo: ahorro mensual o límite de una categoría de gasto (reglas,
 * sección 10). Editar cambia los mismos campos que se eligen al crear, con las mismas validaciones.
 * Solo ofrece categorías de gasto activas que aún no tienen un límite activo (al editar, también
 * la del propio objetivo). Si la base responde 23505 (ya hay otro activo del mismo tipo o de la
 * misma categoría), muestra un aviso amable. La usa también Configuración.
 */
export function FormObjetivo({ onHecho, onCancelar, objetivo, plano = false, ayudaCategoria }: Props) {
  const t = useT('inicio');
  const tc = useT('common');
  const { locale } = useIdioma();
  const categorias = useListarCategoriasQuery();
  const objetivos = useListarObjetivosQuery();
  const [crear, estadoCrear] = useCrearObjetivoMutation();
  const [actualizar, estadoActualizar] = useActualizarObjetivoMutation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const idEditado = objetivo?.id;
  const categoriaEditada = objetivo?.categoria_id ?? null;

  // El propio objetivo no cuenta como «otro» activo: al editarlo puede conservar su tipo y categoría.
  const otros = useMemo(() => (objetivos.data ?? []).filter((o) => o.id !== idEditado), [objetivos.data, idEditado]);
  const hayAhorroActivo = otros.some((o) => o.tipo === 'ahorro_mensual');
  const disponibles = useMemo(() => {
    const conLimite = new Set(otros.filter((o) => o.tipo === 'limite_categoria').map((o) => o.categoria_id));
    return (categorias.data ?? []).filter(
      (c) => c.tipo === 'gasto' && !conLimite.has(c.id) && (!c.archivada || c.id === categoriaEditada),
    );
  }, [categorias.data, otros, categoriaEditada]);

  const esquema = useMemo(
    () =>
      z
        .object({
          tipo: z.enum(['ahorro_mensual', 'limite_categoria']),
          categoria_id: z.string(),
          importe: esquemaImporte(tc('campo.importeInvalido'), locale),
        })
        .superRefine((v, ctx) => {
          if (v.tipo === 'limite_categoria' && v.categoria_id === '') {
            ctx.addIssue({ code: 'custom', path: ['categoria_id'], message: t('form.categoriaObligatoria') });
          }
        }),
    [t, tc, locale],
  );

  const { control, register, handleSubmit, formState } = useForm<
    z.input<typeof esquema>,
    unknown,
    z.output<typeof esquema>
  >({
    resolver: zodResolver(esquema),
    defaultValues: objetivo
      ? {
          tipo: objetivo.tipo,
          categoria_id: objetivo.categoria_id ?? '',
          importe: importeParaEditar(objetivo.importe, locale),
        }
      : {
          tipo: hayAhorroActivo ? 'limite_categoria' : 'ahorro_mensual',
          categoria_id: '',
          importe: '',
        },
  });
  const tipo = useWatch({ control, name: 'tipo' });
  const categoriaId = useWatch({ control, name: 'categoria_id' });
  const tamanoBoton = plano ? 'md' : 'sm';

  const enviar = handleSubmit(async (v) => {
    setErrorEnvio(null);
    const datos = {
      tipo: v.tipo,
      categoria_id: v.tipo === 'limite_categoria' ? v.categoria_id : null,
      importe: v.importe,
    };
    try {
      if (idEditado === undefined) await crear(datos).unwrap();
      else await actualizar({ id: idEditado, ...datos }).unwrap();
      onHecho();
    } catch (e) {
      if (esErrorApi(e) && e.codigo === '23505') {
        setErrorEnvio(v.tipo === 'ahorro_mensual' ? t('form.yaExisteAhorro') : t('form.yaExisteLimite'));
      } else if (esErrorApi(e) && e.codigo === 'red') {
        setErrorEnvio(tc('error.red'));
      } else {
        setErrorEnvio(tc('error.generico'));
      }
    }
  });

  const opciones = [
    { valor: 'ahorro_mensual', etiqueta: t('form.tipo.ahorro') },
    { valor: 'limite_categoria', etiqueta: t('form.tipo.limite') },
  ] as const;

  return (
    <form
      noValidate
      aria-label={idEditado === undefined ? t('form.titulo') : t('form.tituloEditar')}
      onSubmit={(e) => void enviar(e)}
      className={cx('flex flex-col', plano ? 'gap-4' : 'gap-3 rounded-xl border border-borde-input bg-superficie-2 p-3.5')}
    >
      <Controller
        control={control}
        name="tipo"
        render={({ field }) => (
          <SegmentedControl<TipoObjetivo>
            etiqueta={t('form.tipo')}
            opciones={opciones}
            valor={field.value}
            onChange={(v) => {
              field.onChange(v);
              setErrorEnvio(null);
            }}
            anchoCompleto
            tamano="sm"
          />
        )}
      />

      {tipo === 'limite_categoria' &&
        (disponibles.length === 0 && !categorias.isLoading ? (
          <p className="text-sm text-apagado">{t('form.sinCategorias')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Select label={t('form.categoria')} error={formState.errors.categoria_id?.message} {...register('categoria_id')}>
              <option value="">{t('form.categoriaElegir')}</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {nombreCategoria(c, tc)}
                </option>
              ))}
            </Select>
            {ayudaCategoria !== undefined && categoriaId !== '' && ayudaCategoria(categoriaId)}
          </div>
        ))}

      <Controller
        control={control}
        name="importe"
        render={({ field, fieldState }) => (
          <MoneyInput
            label={tipo === 'limite_categoria' ? t('form.importeLimite') : t('form.importeAhorro')}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
            error={fieldState.error?.message}
            {...(tipo === 'ahorro_mensual' ? { placeholder: importeParaEditar('200.00', locale) } : {})}
          />
        )}
      />

      {errorEnvio !== null && (
        <p role="alert" className="text-sm font-medium text-negativo">
          {errorEnvio}
        </p>
      )}

      <div className={cx('flex gap-2', plano ? 'flex-col-reverse sm:flex-row sm:justify-end' : 'justify-end')}>
        <Button variante="secundario" tamano={tamanoBoton} anchoCompleto={plano} className="sm:w-auto" onClick={onCancelar}>
          {tc('accion.cancelar')}
        </Button>
        <Button
          type="submit"
          tamano={tamanoBoton}
          anchoCompleto={plano}
          className="sm:w-auto"
          cargando={estadoCrear.isLoading || estadoActualizar.isLoading}
        >
          {tc('accion.guardar')}
        </Button>
      </div>
    </form>
  );
}
