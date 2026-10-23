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

/** Tres tarjetas: efectivo (con acceso al ajuste), categorías y objetivos (se editan en hojas). */
export function SeccionResumen({ cuentas, categorias, objetivos }: Props) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const nombreCategoria = useNombreCategoria();
  const [hoja, setHoja] = useState<'categorias' | 'objetivos' | null>(null);

  const efectivo = cuentas.find((c) => c.tipo === 'efectivo' && c.fecha_cierre === null) ?? null;
  const activas = categorias.filter((c) => !c.archivada);
  const nGasto = activas.filter((c) => c.tipo === 'gasto').length;
  const nIngreso = activas.filter((c) => c.tipo === 'ingreso').length;
  const resumenObjetivos =
    objetivos.length === 0
      ? t('objetivos.ninguno')
      : objetivos.map((o) => resumenObjetivo(o, formatearEuros(o.importe, locale), categorias, t, nombreCategoria)).join(' · ');

  return (
    <div className="grid gap-4 md:grid-cols-3">
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

      <Card aria-labelledby="config-categorias" className="flex flex-col gap-2.5">
        <h2 id="config-categorias" className="text-base font-semibold text-texto">
          {t('categorias.titulo')}
        </h2>
        <span className="text-sm text-apagado">{t('categorias.resumen', { gasto: nGasto, ingreso: nIngreso })}</span>
        <button type="button" className={CLASE_ENLACE} onClick={() => setHoja('categorias')}>
          {t('categorias.gestionar')}
        </button>
      </Card>

      <Card aria-labelledby="config-objetivos" className="flex flex-col gap-2.5">
        <h2 id="config-objetivos" className="text-base font-semibold text-texto">
          {t('objetivos.titulo')}
        </h2>
        <span className="text-sm text-apagado">{resumenObjetivos}</span>
        <button type="button" className={CLASE_ENLACE} onClick={() => setHoja('objetivos')}>
          {t('objetivos.editarTodos')}
        </button>
      </Card>

      {hoja === 'categorias' && <SheetCategorias categorias={categorias} onCerrar={() => setHoja(null)} />}
      {hoja === 'objetivos' && (
        <SheetObjetivos objetivos={objetivos} categorias={categorias} onCerrar={() => setHoja(null)} />
      )}
    </div>
  );
}
