import { X } from 'lucide-react';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useIdioma, useT } from '@/shared/i18n';
import { formatearFecha } from '@/shared/lib/fechas';
import type { Catalogos } from '../hooks/useCatalogos';
import type { Filtros } from '../lib/filtros';

interface Props {
  filtros: Filtros;
  catalogos: Pick<Catalogos, 'cuentaPorId' | 'categoriaPorId'>;
  /** Quita filtros (los campos que se pasan, a null o vacío). */
  onQuitar: (cambios: Partial<Filtros>) => void;
}

/**
 * Filtros aplicados, visibles sobre la lista como chips con ✕ (auditoría F17): al cerrar el panel
 * de filtros se sigue viendo qué se está mirando y se quita cada uno con un toque. El tipo no sale
 * aquí: ya está marcado en los chips de tipo.
 */
export function FiltrosActivos({ filtros: f, catalogos, onQuitar }: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const nombreCuenta = useNombreCuenta();
  const fecha = (v: string) => formatearFecha(v, locale, 'corta');

  const chips: { id: string; texto: string; quitar: Partial<Filtros> }[] = [];
  if (f.desde !== null || f.hasta !== null) {
    const texto =
      f.desde !== null && f.hasta !== null
        ? t('activos.rango', { desde: fecha(f.desde), hasta: fecha(f.hasta) })
        : f.desde !== null
          ? t('activos.desde', { fecha: fecha(f.desde) })
          : t('activos.hasta', { fecha: fecha(f.hasta ?? '') });
    chips.push({ id: 'periodo', texto, quitar: { desde: null, hasta: null } });
  }
  if (f.categoria !== null) {
    const c = catalogos.categoriaPorId.get(f.categoria);
    if (c) chips.push({ id: 'categoria', texto: nombreCategoria(c), quitar: { categoria: null } });
  }
  if (f.metodo !== null) chips.push({ id: 'metodo', texto: t(`metodo.${f.metodo}`), quitar: { metodo: null } });
  if (f.cuenta !== null) {
    const c = catalogos.cuentaPorId.get(f.cuenta);
    if (c) chips.push({ id: 'cuenta', texto: nombreCuenta(c), quitar: { cuenta: null } });
  }
  if (f.q.trim() !== '') chips.push({ id: 'q', texto: t('activos.busqueda', { q: f.q.trim() }), quitar: { q: '' } });

  if (chips.length === 0) return null;
  const todos = Object.assign({}, ...chips.map((c) => c.quitar)) as Partial<Filtros>;

  return (
    <div role="group" aria-label={t('activos.etiqueta')} className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          data-testid="filtro-activo"
          onClick={() => onQuitar(c.quitar)}
          aria-label={t('activos.quitar', { filtro: c.texto })}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-acento-borde bg-acento-suave px-3 text-[13px] text-texto hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
        >
          {c.texto}
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => onQuitar(todos)}
          className="min-h-9 rounded-full px-2 text-[13px] text-enlace hover:underline focus-visible:outline-2 focus-visible:outline-acento"
        >
          {t('activos.quitarTodos')}
        </button>
      )}
    </div>
  );
}
