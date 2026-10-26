import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Trash2 } from 'lucide-react';
import { FormObjetivo } from '@/features/inicio/components/FormObjetivo';
import {
  useActualizarImporteObjetivoMutation,
  useDesactivarObjetivoMutation,
  type Categoria,
  type Objetivo,
} from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { formatearEuros, importePositivo } from '@/shared/lib/dinero';
import { Button, MoneyInput, Sheet, importeParaEditar } from '@/shared/ui';
import { claveError } from '../api/errores';
import { AlertaError } from './AlertaError';
import { MediaCategoria } from './MediaCategoria';
import { etiquetaObjetivo } from './objetivos';

type Vista =
  | { modo: 'lista' }
  | { modo: 'nuevo' }
  | { modo: 'editar'; objetivo: Objetivo }
  | { modo: 'quitar'; objetivo: Objetivo };

interface Props {
  objetivos: readonly Objetivo[];
  categorias: readonly Categoria[];
  onCerrar: () => void;
}

const CLASE_ICONO = 'rounded-lg p-2 text-apagado transition-colors hover:bg-superficie-2 hover:text-texto';

/** Botones de un formulario del modal: apilados a ancho completo en móvil, en línea desde `sm`. */
const CLASE_BOTONES = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end';

function EditarImporte({ objetivo, onHecho }: { objetivo: Objetivo; onHecho: () => void }) {
  const t = useT('configuracion');
  const tc = useT('common');
  const { locale } = useIdioma();
  const [texto, setTexto] = useState(() => importeParaEditar(objetivo.importe, locale));
  const [errorCampo, setErrorCampo] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [actualizar, { isLoading }] = useActualizarImporteObjetivoMutation();

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const importe = importePositivo(texto, locale);
    if (importe === null) {
      setErrorCampo(tc('campo.importeInvalido'));
      return;
    }
    setErrorCampo(undefined);
    try {
      await actualizar({ id: objetivo.id, importe }).unwrap();
      toast.success(t('objetivos.guardado'));
      onHecho();
    } catch (err) {
      setError(t(claveError(err)));
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-4">
      <MoneyInput label={t('objetivos.importe')} value={texto} onChange={setTexto} error={errorCampo} />
      <AlertaError mensaje={error} />
      <div className={CLASE_BOTONES}>
        <Button variante="secundario" anchoCompleto className="sm:w-auto" onClick={onHecho}>
          {t('accion.cancelar')}
        </Button>
        <Button type="submit" anchoCompleto className="sm:w-auto" cargando={isLoading}>
          {t('accion.guardar')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Objetivos activos: cambiar importe, quitar (se desactiva y conserva historia) y añadir.
 * Modal plano: cada vista ocupa el modal entero con su propio título y vuelve a la lista al
 * cancelar o guardar (sin «Volver a la lista» ni tarjeta dentro de la tarjeta).
 */
export function SheetObjetivos({ objetivos, categorias, onCerrar }: Props) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const [vista, setVista] = useState<Vista>({ modo: 'lista' });
  const [error, setError] = useState<string | null>(null);
  const [desactivar, estadoQuitar] = useDesactivarObjetivoMutation();
  const aLista = () => setVista({ modo: 'lista' });

  const quitar = async (o: Objetivo) => {
    setError(null);
    try {
      await desactivar(o.id).unwrap();
      toast.success(t('objetivos.quitado'));
      aLista();
    } catch (e) {
      setError(t(claveError(e)));
    }
  };

  const titulo =
    vista.modo === 'nuevo'
      ? t('objetivos.nuevo')
      : vista.modo === 'editar'
        ? etiquetaObjetivo(vista.objetivo, categorias, t, nombreCategoria)
        : vista.modo === 'quitar'
          ? t('objetivos.quitarTitulo')
          : t('objetivos.titulo');

  return (
    <Sheet abierto onCerrar={onCerrar} titulo={titulo}>
      {vista.modo === 'nuevo' && (
        <FormObjetivo
          plano
          onHecho={aLista}
          onCancelar={aLista}
          ayudaCategoria={(id) => <MediaCategoria categoriaId={id} categorias={categorias} />}
        />
      )}

      {vista.modo === 'editar' && <EditarImporte objetivo={vista.objetivo} onHecho={aLista} />}

      {vista.modo === 'quitar' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texto">
            {t('objetivos.quitarConfirmar', { objetivo: etiquetaObjetivo(vista.objetivo, categorias, t, nombreCategoria) })}
          </p>
          <AlertaError mensaje={error} />
          <div className={CLASE_BOTONES}>
            <Button variante="secundario" anchoCompleto className="sm:w-auto" onClick={aLista}>
              {t('accion.cancelar')}
            </Button>
            <Button
              variante="peligro"
              anchoCompleto
              className="sm:w-auto"
              cargando={estadoQuitar.isLoading}
              onClick={() => void quitar(vista.objetivo)}
            >
              {t('objetivos.quitarSi')}
            </Button>
          </div>
        </div>
      )}

      {vista.modo === 'lista' && (
        <div className="flex flex-col gap-4">
          {objetivos.length === 0 ? (
            <p className="text-sm text-apagado">{t('objetivos.vacio')}</p>
          ) : (
            <ul className="flex flex-col">
              {objetivos.map((o) => {
                const etiqueta = etiquetaObjetivo(o, categorias, t, nombreCategoria);
                return (
                  <li key={o.id} className="flex items-center gap-2 border-t border-borde py-2 first:border-t-0">
                    <span className="min-w-0 flex-1 truncate font-medium text-texto">{etiqueta}</span>
                    <span className="font-semibold text-texto tabular-nums">{formatearEuros(o.importe, locale)}</span>
                    <button
                      type="button"
                      className={CLASE_ICONO}
                      aria-label={t('objetivos.editarImporte', { objetivo: etiqueta })}
                      onClick={() => setVista({ modo: 'editar', objetivo: o })}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={CLASE_ICONO}
                      aria-label={t('objetivos.quitar', { objetivo: etiqueta })}
                      onClick={() => {
                        setError(null);
                        setVista({ modo: 'quitar', objetivo: o });
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button variante="secundario" className="self-start" onClick={() => setVista({ modo: 'nuevo' })}>
            {t('objetivos.anadir')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
