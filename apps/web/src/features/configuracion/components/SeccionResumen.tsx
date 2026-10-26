import { useState } from 'react';
import { Link } from 'react-router';
import type { Categoria, Cuenta, Objetivo } from '@/shared/api/catalogos';
import { useNombreCategoria } from '@/shared/hooks/useNombreCategoria';
import { useIdioma, useT } from '@/shared/i18n';
import { formatearEuros } from '@/shared/lib/dinero';
import { Card } from '@/shared/ui';
import { resumenObjetivo } from './objetivos';
import { rutaAjuste } from './rutas';
import { SheetCategorias } from './SheetCategorias';
import { SheetObjetivos } from './SheetObjetivos';

interface Props {
  cuentas: readonly Cuenta[];
  categorias: readonly Categoria[];
  objetivos: readonly Objetivo[];
}

const CLASE_ENLACE = 'self-start text-sm font-medium text-enlace hover:underline';

/** Efectivo, con acceso al ajuste. */
export function TarjetaEfectivo({ cuentas }: Pick<Props, 'cuentas'>) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const efectivo = cuentas.find((c) => c.tipo === 'efectivo' && c.fecha_cierre === null) ?? null;
  return (
    <Card aria-labelledby="config-efectivo" className="flex flex-col gap-2.5">
      <h2 id="config-efectivo" className="text-base font-semibold text-texto">
        {t('efectivo.titulo')}
      </h2>
      {efectivo === null ? (
        <p className="text-sm text-apagado">{t('efectivo.sinCuenta')}</p>
      ) : (
        <>
          <span className="text-2xl font-bold text-texto tabular-nums">
            {efectivo.valor === null ? t('bancos.sinValor') : formatearEuros(efectivo.valor, locale)}
          </span>
          <Link to={rutaAjuste(efectivo.id)} className={CLASE_ENLACE}>
            {t('efectivo.ajuste')}
          </Link>
        </>
      )}
    </Card>
  );
}

/** Categorías: resumen y hoja para gestionarlas. */
export function TarjetaCategorias({ categorias }: Pick<Props, 'categorias'>) {
  const t = useT('configuracion');
  const [abierta, setAbierta] = useState(false);
  const activas = categorias.filter((c) => !c.archivada);
  const nGasto = activas.filter((c) => c.tipo === 'gasto').length;
  const nIngreso = activas.filter((c) => c.tipo === 'ingreso').length;
  return (
    <Card aria-labelledby="config-categorias" className="flex flex-col gap-2.5">
      <h2 id="config-categorias" className="text-base font-semibold text-texto">
        {t('categorias.titulo')}
      </h2>
      <span className="text-sm text-apagado">{t('categorias.resumen', { gasto: nGasto, ingreso: nIngreso })}</span>
      <button type="button" className={CLASE_ENLACE} onClick={() => setAbierta(true)}>
        {t('categorias.gestionar')}
      </button>
      {abierta && <SheetCategorias categorias={categorias} onCerrar={() => setAbierta(false)} />}
    </Card>
  );
}

/** Objetivos: resumen y hoja para editarlos. */
export function TarjetaObjetivos({ categorias, objetivos }: Pick<Props, 'categorias' | 'objetivos'>) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const [abierta, setAbierta] = useState(false);
  const resumen =
    objetivos.length === 0
      ? t('objetivos.ninguno')
      : objetivos.map((o) => resumenObjetivo(o, formatearEuros(o.importe, locale), categorias, t, nombreCategoria)).join(' · ');
  return (
    <Card aria-labelledby="config-objetivos" className="flex flex-col gap-2.5">
      <h2 id="config-objetivos" className="text-base font-semibold text-texto">
        {t('objetivos.titulo')}
      </h2>
      <span className="text-sm text-apagado">{resumen}</span>
      <button type="button" className={CLASE_ENLACE} onClick={() => setAbierta(true)}>
        {t('objetivos.editarTodos')}
      </button>
      {abierta && <SheetObjetivos objetivos={objetivos} categorias={categorias} onCerrar={() => setAbierta(false)} />}
    </Card>
  );
}

/** Tres tarjetas: efectivo (con acceso al ajuste), categorías y objetivos (se editan en hojas). */
export function SeccionResumen({ cuentas, categorias, objetivos }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <TarjetaEfectivo cuentas={cuentas} />
      <TarjetaCategorias categorias={categorias} />
      <TarjetaObjetivos categorias={categorias} objetivos={objetivos} />
    </div>
  );
}
