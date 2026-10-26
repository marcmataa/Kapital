import { useState } from 'react';
import toast from 'react-hot-toast';
import { useCrearObjetivoMutation, useListarCategoriasQuery, useListarObjetivosQuery } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useT } from '@/shared/i18n';
import { importePositivo } from '@/shared/lib/dinero';
import { Button, importeParaEditar, MoneyInput, Sheet, Spinner } from '@/shared/ui';
import { useLocale } from '../hooks/useLocale';
import type { AccionAnalisis } from '../schemas/esquemas';

interface Props {
  accion: AccionAnalisis;
  onCerrar: () => void;
}

function codigoDe(e: unknown): string | null {
  return typeof e === 'object' && e !== null && typeof (e as { codigo?: unknown }).codigo === 'string'
    ? (e as { codigo: string }).codigo
    : null;
}

/**
 * «Crear límite» desde una recomendación de la IA: la categoría y el importe llegan prellenados
 * (el importe se puede cambiar). La categoría se busca por su nombre en la base entre las de gasto
 * activas; si ya no existe o ya tiene un límite, se dice y no se crea nada.
 */
export function DialogoCrearLimite({ accion, onCerrar }: Props) {
  const t = useT('analisis');
  const tc = useT('common');
  const locale = useLocale();
  const nombreDe = useNombreCategoria();
  const categorias = useListarCategoriasQuery();
  const objetivos = useListarObjetivosQuery();
  const [crear, { isLoading }] = useCrearObjetivoMutation();
  const [texto, setTexto] = useState(() => importeParaEditar(accion.importe, locale));
  const [error, setError] = useState<string | null>(null);

  const categoria = (categorias.data ?? []).find(
    (c) => c.nombre === accion.categoria && c.tipo === 'gasto' && !c.archivada,
  );
  const yaTieneLimite =
    categoria !== undefined &&
    (objetivos.data ?? []).some((o) => o.tipo === 'limite_categoria' && o.categoria_id === categoria.id);
  const cargando = categorias.isLoading || objetivos.isLoading;
  const nombre = categoria ? nombreDe(categoria) : accion.etiqueta;

  const guardar = async () => {
    setError(null);
    const importe = importePositivo(texto, locale);
    if (importe === null) {
      setError(tc('campo.importeInvalido'));
      return;
    }
    if (!categoria) return;
    try {
      await crear({ tipo: 'limite_categoria', categoria_id: categoria.id, importe }).unwrap();
      toast.success(t('limite.hecho', { categoria: nombre }));
      onCerrar();
    } catch (e) {
      const codigo = codigoDe(e);
      setError(codigo === '23505' ? t('limite.yaExiste') : codigo === 'red' ? t('error.red') : t('error.generico'));
    }
  };

  const bloqueado = cargando || categoria === undefined || yaTieneLimite;

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={t('limite.titulo', { categoria: nombre })}
      pie={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variante="secundario" onClick={onCerrar}>
            {tc('accion.cancelar')}
          </Button>
          <Button onClick={() => void guardar()} cargando={isLoading} disabled={bloqueado}>
            {t('limite.crear')}
          </Button>
        </div>
      }
    >
      {cargando ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : categoria === undefined ? (
        <p role="status" className="text-sm text-texto">{t('limite.sinCategoria', { categoria: accion.etiqueta })}</p>
      ) : yaTieneLimite ? (
        <p role="status" className="text-sm text-texto">{t('limite.yaExiste')}</p>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-apagado">{t('limite.descripcion', { categoria: nombre })}</p>
          <MoneyInput
            label={t('limite.importe')}
            value={texto}
            onChange={(v) => {
              setTexto(v);
              setError(null);
            }}
            error={error ?? undefined}
          />
        </form>
      )}
    </Sheet>
  );
}
