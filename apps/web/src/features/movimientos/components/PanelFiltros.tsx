import { useState, type FormEvent } from 'react';
import type { Categoria, Cuenta } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useNombreCuenta } from '@/shared/hooks/useNombreCuenta';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { Button, Input, Select } from '@/shared/ui';
import type { Filtros } from '../lib/filtros';
import { METODOS, esMetodo, esUuid } from '../lib/tipos';

interface Props {
  filtros: Filtros;
  cuentas: readonly Cuenta[];
  categorias: readonly Categoria[];
  onAplicar: (cambios: Pick<Filtros, 'desde' | 'hasta' | 'categoria' | 'metodo' | 'cuenta'>) => void;
  /** Disposición: rejilla (panel de escritorio) o columna (hoja en móvil). */
  variante: 'panel' | 'hoja';
  className?: string;
}

/** Desde/hasta, categoría, método y cuenta. Se edita un borrador y se aplica al pulsar «Aplicar». */
export function PanelFiltros({ filtros, cuentas, categorias, onAplicar, variante, className }: Props) {
  const t = useT('movimientos');
  const nombreCuenta = useNombreCuenta();
  const nombreCategoria = useNombreCategoria();
  const [desde, setDesde] = useState(filtros.desde ?? '');
  const [hasta, setHasta] = useState(filtros.hasta ?? '');
  const [categoria, setCategoria] = useState(filtros.categoria ?? '');
  const [metodo, setMetodo] = useState<string>(filtros.metodo ?? '');
  const [cuenta, setCuenta] = useState(filtros.cuenta ?? '');
  const rangoInvalido = desde !== '' && hasta !== '' && desde > hasta;

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    if (rangoInvalido) return;
    onAplicar({
      desde: desde === '' ? null : desde,
      hasta: hasta === '' ? null : hasta,
      categoria: esUuid(categoria) ? categoria : null,
      metodo: esMetodo(metodo) ? metodo : null,
      cuenta: esUuid(cuenta) ? cuenta : null,
    });
  };

  const restablecer = () => {
    setDesde('');
    setHasta('');
    setCategoria('');
    setMetodo('');
    setCuenta('');
    onAplicar({ desde: null, hasta: null, categoria: null, metodo: null, cuenta: null });
  };

  const gastos = categorias.filter((c) => c.tipo === 'gasto');
  const ingresos = categorias.filter((c) => c.tipo === 'ingreso');

  return (
    <form
      onSubmit={aplicar}
      aria-label={t('filtros.titulo')}
      className={cx(
        variante === 'panel'
          ? 'grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3.5 rounded-2xl border border-borde bg-superficie p-4'
          : 'flex flex-col gap-4',
        className,
      )}
    >
      <Input
        label={t('filtros.desde')}
        type="date"
        value={desde}
        max={hasta || undefined}
        onChange={(e) => setDesde(e.target.value)}
        error={rangoInvalido ? t('filtros.rangoInvalido') : undefined}
      />
      <Input label={t('filtros.hasta')} type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
      <Select label={t('filtros.categoria')} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        <option value="">{t('filtros.todas')}</option>
        <optgroup label={t('filtros.categoriasGasto')}>
          {gastos.map((c) => (
            <option key={c.id} value={c.id}>
              {nombreCategoria(c)}
            </option>
          ))}
        </optgroup>
        <optgroup label={t('filtros.categoriasIngreso')}>
          {ingresos.map((c) => (
            <option key={c.id} value={c.id}>
              {nombreCategoria(c)}
            </option>
          ))}
        </optgroup>
      </Select>
      <Select label={t('filtros.metodo')} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
        <option value="">{t('filtros.todos')}</option>
        {METODOS.map((m) => (
          <option key={m} value={m}>
            {t(`metodo.${m}`)}
          </option>
        ))}
      </Select>
      <Select
        label={t('filtros.cuenta')}
        value={cuenta}
        onChange={(e) => setCuenta(e.target.value)}
        ayuda={variante === 'hoja' ? t('filtros.cuentaAyuda') : undefined}
      >
        <option value="">{t('filtros.todas')}</option>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {nombreCuenta(c)}
          </option>
        ))}
      </Select>
      <div className={cx('flex items-end gap-2', variante === 'hoja' && 'pt-2')}>
        <Button variante="secundario" onClick={restablecer} anchoCompleto={variante === 'hoja'}>
          {t('filtros.restablecer')}
        </Button>
        <Button type="submit" disabled={rangoInvalido} anchoCompleto={variante === 'hoja'}>
          {t('filtros.aplicar')}
        </Button>
      </div>
    </form>
  );
}
