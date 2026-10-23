import { useId, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import type { Categoria } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { Button, Input } from '@/shared/ui';
import {
  useConfigActualizarCategoriaMutation,
  useConfigCrearCategoriaMutation,
  type CambiosCategoria,
} from '../api/configuracionApi';
import { claveError } from '../api/errores';
import { COLORES_CATEGORIA, NOMBRE_MAXIMO, esquemaCategoria } from '../schemas/categoria';
import { AlertaError } from './AlertaError';
import { esProtegida } from './categorias';

interface Props {
  tipo: Categoria['tipo'];
  /** Categoría a editar; sin ella, se crea una nueva. */
  categoria?: Categoria;
  /** `orden` para una categoría nueva (al final). */
  ordenNueva: number;
  onHecho: () => void;
  onCancelar: () => void;
}

type Errores = Partial<Record<'nombre' | 'icono', string>>;

/** Alta o edición de una categoría: nombre, color (muestras accesibles) e icono opcional. */
export function FormCategoria({ tipo, categoria, ordenNueva, onHecho, onCancelar }: Props) {
  const t = useT('configuracion');
  const nombreCategoria = useNombreCategoria();
  const idColor = useId();
  // Las categorías por defecto se editan con el nombre que el usuario ve (traducido).
  const [nombreInicial] = useState(() => (categoria === undefined ? '' : nombreCategoria(categoria)));
  const [nombre, setNombre] = useState(nombreInicial);
  const [color, setColor] = useState<string>(categoria?.color ?? COLORES_CATEGORIA[0]);
  const [icono, setIcono] = useState(categoria?.icono ?? '');
  const [errores, setErrores] = useState<Errores>({});
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [crear, estadoCrear] = useConfigCrearCategoriaMutation();
  const [actualizar, estadoActualizar] = useConfigActualizarCategoriaMutation();

  const protegida = categoria !== undefined && esProtegida(categoria);
  const colores: readonly string[] = (COLORES_CATEGORIA as readonly string[]).includes(color.toLowerCase())
    ? COLORES_CATEGORIA
    : [color, ...COLORES_CATEGORIA];

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorEnvio(null);
    const r = esquemaCategoria({
      nombreObligatorio: t('categorias.nombreObligatorio'),
      nombreLargo: t('categorias.nombreLargo'),
      iconoLargo: t('categorias.iconoLargo'),
    }).safeParse({ nombre, color, icono });
    if (!r.success) {
      const nuevos: Errores = {};
      for (const issue of r.error.issues) {
        const campo = issue.path[0];
        if ((campo === 'nombre' || campo === 'icono') && nuevos[campo] === undefined) nuevos[campo] = issue.message;
      }
      setErrores(nuevos);
      return;
    }
    setErrores({});
    const datos = { nombre: r.data.nombre, color: r.data.color, icono: r.data.icono === '' ? null : r.data.icono };
    try {
      if (categoria === undefined) {
        await crear({ ...datos, tipo, orden: ordenNueva }).unwrap();
      } else {
        // La protegida (Rendimientos) conserva su nombre: el atajo la busca así.
        // Si el nombre que ve no cambia, se conserva (y con él la traducción); si lo cambia,
        // pasa a ser una categoría propia: se guarda tal cual y sin clave.
        const mismoNombre = datos.nombre === nombreInicial.trim();
        const cambios: CambiosCategoria =
          protegida || mismoNombre
            ? { color: datos.color, icono: datos.icono }
            : { ...datos, ...(categoria.clave === null ? {} : { clave: null }) };
        await actualizar({ id: categoria.id, cambios }).unwrap();
      }
      onHecho();
    } catch (error) {
      setErrorEnvio(t(claveError(error, { '23505': 'categorias.errorDuplicado' })));
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-5">
      <Input
        label={t('categorias.nombre')}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={errores.nombre}
        maxLength={NOMBRE_MAXIMO}
        disabled={protegida}
        ayuda={
          protegida
            ? t('categorias.protegida')
            : categoria !== undefined
              ? t('categorias.renombrarAviso')
              : undefined
        }
        autoComplete="off"
      />

      <fieldset className="flex flex-col gap-2">
        <legend id={idColor} className="mb-2 text-sm font-medium text-texto">
          {t('categorias.color')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {colores.map((c, i) => {
            const activo = c.toLowerCase() === color.toLowerCase();
            return (
              <label key={c} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={`${idColor}-color`}
                  value={c}
                  checked={activo}
                  onChange={() => setColor(c)}
                  className="peer sr-only"
                  aria-label={t('categorias.colorNombre', { n: i + 1 })}
                />
                <span
                  aria-hidden="true"
                  className={cx(
                    'flex size-9 items-center justify-center rounded-full border-2 transition-shadow',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-acento peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-superficie',
                    activo ? 'border-texto' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                >
                  {activo && <Check className="size-4 text-white drop-shadow" />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Input
        label={t('categorias.icono')}
        opcional
        value={icono}
        onChange={(e) => setIcono(e.target.value)}
        error={errores.icono}
        className="max-w-40"
        autoComplete="off"
      />

      <AlertaError mensaje={errorEnvio} />

      <div className="flex justify-end gap-2">
        <Button variante="secundario" onClick={onCancelar}>
          {t('accion.cancelar')}
        </Button>
        <Button type="submit" cargando={estadoCrear.isLoading || estadoActualizar.isLoading}>
          {t('accion.guardar')}
        </Button>
      </div>
    </form>
  );
}
