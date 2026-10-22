import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useT, type ClaveDe } from '@/shared/i18n';
import { Card } from '@/shared/ui';
import { CabeceraPagina } from './CabeceraPagina';
import { NAV_ANALISIS, NAV_CONFIGURACION, type ItemNav } from './navegacion';

const ENTRADAS: readonly { item: ItemNav; descripcion: ClaveDe<'common'> }[] = [
  { item: NAV_ANALISIS, descripcion: 'mas.analisisDescripcion' },
  { item: NAV_CONFIGURACION, descripcion: 'mas.configuracionDescripcion' },
];

/** /mas: en el móvil agrupa las secciones que no caben en la bottom nav. */
export function PaginaMas() {
  const t = useT('common');
  return (
    <>
      <CabeceraPagina titulo={t('mas.titulo')} />
      <Card sinPadding>
        <ul className="divide-y divide-borde">
          {ENTRADAS.map(({ item, descripcion }) => (
            <li key={item.ruta}>
              <Link
                to={item.ruta}
                className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-superficie-2 sm:px-5"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-acento-suave text-acento">
                  <item.Icono aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-texto">{t(item.clave)}</span>
                  <span className="block truncate text-sm text-apagado">{t(descripcion)}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-5 text-apagado" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
