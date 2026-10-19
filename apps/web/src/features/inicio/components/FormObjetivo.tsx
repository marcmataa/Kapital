import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ErrorApi } from '@/app/api';
import { useCrearObjetivoMutation, useListarCategoriasQuery, useListarObjetivosQuery } from '@/shared/api/catalogos';
import { useT } from '@/shared/i18n';
import { esquemaImporte } from '@/shared/lib/esquemas';
import { Button, MoneyInput, SegmentedControl, Select } from '@/shared/ui';

type TipoObjetivo = 'ahorro_mensual' | 'limite_categoria';

interface Props {
  /** Se llama tras crear el objetivo (la lista se refresca sola por la etiqueta 'Objetivos'). */
  onHecho: () => void;
  onCancelar: () => void;
}

function esErrorApi(e: unknown): e is ErrorApi {
  return typeof e === 'object' && e !== null && typeof (e as { codigo?: unknown }).codigo === 'string';
}

/**
 * Alta de un objetivo: ahorro mensual o límite de una categoría de gasto (reglas, sección 10).
 * Solo ofrece categorías de gasto activas que aún no tienen un límite activo. Si la base
 * responde 23505 (ya hay uno activo del mismo tipo/categoría), muestra un aviso amable.
 * La usa también Configuración.
 */
export function FormObjetivo({ onHecho, onCancelar }: Props) {
  const t = useT('inicio');
  const tc = useT('common');
  const categorias = useListarCategoriasQuery();
  const objetivos = useListarObjetivosQuery();
  const [crear, { isLoading }] = useCrearObjetivoMutation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const hayAhorroActivo = (objetivos.data ?? []).some((o) => o.tipo === 'ahorro_mensual');
  const disponibles = useMemo(() => {
    const conLimite = new Set(
      (objetivos.data ?? []).filter((o) => o.tipo === 'limite_categoria').map((o) => o.categoria_id),
    );
    return (categorias.data ?? []).filter((c) => c.tipo === 'gasto' && !c.archivada && !conLimite.has(c.id));
  }, [categorias.data, objetivos.data]);

  const esquema = useMemo(
    () =>
      z
        .object({
          tipo: z.enum(['ahorro_mensual', 'limite_categoria']),
          categoria_id: z.string(),
          importe: esquemaImporte(tc('campo.importeInvalido')),
        })
        .superRefine((v, ctx) => {
          if (v.tipo === 'limite_categoria' && v.categoria_id === '') {
            ctx.addIssue({ code: 'custom', path: ['categoria_id'], message: t('form.categoriaObligatoria') });
          }
        }),
    [t, tc],
  );

  const { control, register, handleSubmit, formState } = useForm<
    z.input<typeof esquema>,
    unknown,
    z.output<typeof esquema>
  >({
    resolver: zodResolver(esquema),
    defaultValues: {
      tipo: hayAhorroActivo ? 'limite_categoria' : 'ahorro_mensual',
      categoria_id: '',
      importe: '',
    },
  });
  const tipo = useWatch({ control, name: 'tipo' });

  const enviar = handleSubmit(async (v) => {
    setErrorEnvio(null);
    try {
      await crear({
        tipo: v.tipo,
        categoria_id: v.tipo === 'limite_categoria' ? v.categoria_id : null,
        importe: v.importe,
      }).unwrap();
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
      aria-label={t('form.titulo')}
      onSubmit={(e) => void enviar(e)}
      className="flex flex-col gap-3 rounded-xl border border-borde-input bg-superficie-2 p-3.5"
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
          <Select label={t('form.categoria')} error={formState.errors.categoria_id?.message} {...register('categoria_id')}>
            <option value="">{t('form.categoriaElegir')}</option>
            {disponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
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
          />
        )}
      />

      {errorEnvio !== null && (
        <p role="alert" className="text-sm font-medium text-negativo">
          {errorEnvio}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variante="secundario" tamano="sm" onClick={onCancelar}>
          {tc('accion.cancelar')}
        </Button>
        <Button type="submit" tamano="sm" cargando={isLoading}>
          {tc('accion.guardar')}
        </Button>
      </div>
    </form>
  );
}
