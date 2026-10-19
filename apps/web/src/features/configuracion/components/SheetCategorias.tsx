import { useState } from 'react';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowUp, Lock, Pencil } from 'lucide-react';
import type { Categoria } from '@/shared/api/catalogos';
import { useT } from '@/shared/i18n';
import { Button, SegmentedControl, Sheet } from '@/shared/ui';
import { useConfigActualizarCategoriaMutation, useConfigReordenarCategoriasMutation } from '../api/configuracionApi';
import { claveError } from '../api/errores';
import { AlertaError } from './AlertaError';
import { deTipo, esProtegida, reordenar } from './categorias';
import { FormCategoria } from './FormCategoria';

type Tipo = Categoria['tipo'];
type Vista = { modo: 'lista' } | { modo: 'nueva' } | { modo: 'editar'; categoria: Categoria };

interface Props {
  categorias: readonly Categoria[];
  onCerrar: () => void;
}

const CLASE_ICONO =
  'rounded-lg p-2 text-apagado transition-colors hover:bg-superficie-2 hover:text-texto disabled:pointer-events-none disabled:opacity-30';

function Muestra({ categoria }: { categoria: Categoria }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm"
      style={{ backgroundColor: categoria.color }}
    >
      {categoria.icono}
    </span>
  );
}

/** Gestión de categorías: gasto e ingreso separados (reglas, sección 8), nunca mezclados. */
export function SheetCategorias({ categorias, onCerrar }: Props) {
  const t = useT('configuracion');
  const [tipo, setTipo] = useState<Tipo>('gasto');
  const [vista, setVista] = useState<Vista>({ modo: 'lista' });
  const [error, setError] = useState<string | null>(null);
  const [actualizar] = useConfigActualizarCategoriaMutation();
  const [reordenarCategorias, estadoOrden] = useConfigReordenarCategoriasMutation();

  const activas = deTipo(categorias, tipo, false);
  const archivadas = deTipo(categorias, tipo, true);
  const ordenNueva = categorias.reduce((max, c) => Math.max(max, c.orden), 0) + 1;
  const nombreTipo = t(tipo === 'gasto' ? 'categorias.gasto' : 'categorias.ingreso');

  const mover = async (indice: number, delta: -1 | 1) => {
    const cambios = reordenar(activas, indice, delta);
    if (cambios.length === 0) return;
    setError(null);
    try {
      await reordenarCategorias(cambios).unwrap();
    } catch (e) {
      setError(t(claveError(e, {}) === 'error.red' ? 'error.red' : 'categorias.errorOrden'));
    }
  };

  const archivar = async (c: Categoria, archivada: boolean) => {
    if (esProtegida(c)) return;
    setError(null);
    try {
      await actualizar({ id: c.id, cambios: { archivada } }).unwrap();
    } catch (e) {
      setError(t(claveError(e)));
    }
  };

  const terminar = () => {
    toast.success(t('categorias.guardado'));
    setVista({ modo: 'lista' });
  };

  const titulo =
    vista.modo === 'lista'
      ? t('categorias.titulo')
      : vista.modo === 'nueva'
        ? t('categorias.formNueva', { tipo: nombreTipo.toLowerCase() })
        : t('categorias.formEditar');

  return (
    <Sheet abierto onCerrar={onCerrar} titulo={titulo}>
      {vista.modo !== 'lista' ? (
        <div className="flex flex-col gap-4">
          <Button
            variante="fantasma"
            tamano="sm"
            className="self-start"
            icono={<ArrowLeft aria-hidden="true" className="size-4" />}
            onClick={() => setVista({ modo: 'lista' })}
          >
            {t('categorias.volver')}
          </Button>
          <FormCategoria
            tipo={tipo}
            ordenNueva={ordenNueva}
            {...(vista.modo === 'editar' ? { categoria: vista.categoria } : {})}
            onHecho={terminar}
            onCancelar={() => setVista({ modo: 'lista' })}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            etiqueta={t('categorias.tipo')}
            anchoCompleto
            opciones={[
              { valor: 'gasto', etiqueta: t('categorias.gasto') },
              { valor: 'ingreso', etiqueta: t('categorias.ingreso') },
            ]}
            valor={tipo}
            onChange={(v) => {
              setTipo(v);
              setError(null);
            }}
          />

          <AlertaError mensaje={error} />

          {activas.length === 0 ? (
            <p className="text-sm text-apagado">{t('categorias.vacio')}</p>
          ) : (
            <ul aria-label={nombreTipo} className="flex flex-col">
              {activas.map((c, i) => {
                const protegida = esProtegida(c);
                return (
                  <li key={c.id} className="flex flex-col gap-1 border-t border-borde py-2 first:border-t-0">
                    <div className="flex items-center gap-2">
                      <Muestra categoria={c} />
                      <span className="min-w-0 flex-1 truncate font-medium text-texto">{c.nombre}</span>
                      <button
                        type="button"
                        className={CLASE_ICONO}
                        disabled={i === 0 || estadoOrden.isLoading}
                        aria-label={t('categorias.subir', { nombre: c.nombre })}
                        onClick={() => void mover(i, -1)}
                      >
                        <ArrowUp aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={CLASE_ICONO}
                        disabled={i === activas.length - 1 || estadoOrden.isLoading}
                        aria-label={t('categorias.bajar', { nombre: c.nombre })}
                        onClick={() => void mover(i, 1)}
                      >
                        <ArrowDown aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={CLASE_ICONO}
                        aria-label={t('categorias.editar', { nombre: c.nombre })}
                        onClick={() => setVista({ modo: 'editar', categoria: c })}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </button>
                      {protegida ? (
                        <span className="p-2 text-tenue" aria-hidden="true">
                          <Lock className="size-4" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={CLASE_ICONO}
                          aria-label={t('categorias.archivar', { nombre: c.nombre })}
                          onClick={() => void archivar(c, true)}
                        >
                          <Archive aria-hidden="true" className="size-4" />
                        </button>
                      )}
                    </div>
                    {protegida && <p className="pl-10 text-xs text-apagado">{t('categorias.protegida')}</p>}
                  </li>
                );
              })}
            </ul>
          )}

          <Button variante="secundario" className="self-start" onClick={() => setVista({ modo: 'nueva' })}>
            {t('categorias.nueva')}
          </Button>

          {archivadas.length > 0 && (
            <details className="border-t border-borde pt-3">
              <summary className="cursor-pointer text-sm font-medium text-apagado hover:text-texto">
                {t('categorias.archivadas', { n: archivadas.length })}
              </summary>
              <p className="mt-2 text-xs text-apagado">{t('categorias.archivadasAyuda')}</p>
              <ul className="mt-2 flex flex-col">
                {archivadas.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-1.5">
                    <Muestra categoria={c} />
                    <span className="min-w-0 flex-1 truncate text-sm text-apagado">{c.nombre}</span>
                    <button
                      type="button"
                      className={CLASE_ICONO}
                      aria-label={t('categorias.desarchivar', { nombre: c.nombre })}
                      onClick={() => void archivar(c, false)}
                    >
                      <ArchiveRestore aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Sheet>
  );
}
