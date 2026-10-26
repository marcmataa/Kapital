import { Link } from 'react-router';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useCerrarSesion } from '@/shared/hooks/useCerrarSesion';
import { useNombreUsuario } from '@/shared/hooks/useNombreUsuario';
import { useT, type ClaveDe } from '@/shared/i18n';
import { Button, Card } from '@/shared/ui';
import { CabeceraPagina } from './CabeceraPagina';
import { NAV_ANALISIS, NAV_CONFIGURACION, type ItemNav } from './navegacion';
import { SelectorTema } from './SelectorTema';

const ENTRADAS: readonly { item: ItemNav; descripcion: ClaveDe<'common'> }[] = [
  { item: NAV_ANALISIS, descripcion: 'mas.analisisDescripcion' },
  { item: NAV_CONFIGURACION, descripcion: 'mas.configuracionDescripcion' },
];

/**
 * /mas: en el móvil agrupa las secciones que no caben en la bottom nav, el tema (el mismo control
 * que en el menú lateral y en Configuración), la cuenta conectada y, al final, cerrar sesión.
 */
export function PaginaMas() {
  const t = useT('common');
  const { usuario } = useAuth();
  const { completo } = useNombreUsuario();
  const { salir, saliendo } = useCerrarSesion();
  const email = usuario?.email ?? '';

  return (
    <div className="flex flex-col gap-4">
      <CabeceraPagina titulo={t('mas.titulo')} />
      <Card sinPadding>
        <ul className="divide-y divide-borde">
          {ENTRADAS.map(({ item, descripcion }) => (
            <li key={item.ruta}>
              <Link
                to={item.ruta}
                className="flex items-center gap-4 rounded-2xl px-4 py-4 transition-colors hover:bg-texto/5 sm:px-5"
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

      <Card aria-labelledby="mas-apariencia" className="flex flex-col gap-3">
        <h2 id="mas-apariencia" className="text-base font-semibold text-texto">
          {t('mas.apariencia')}
        </h2>
        <SelectorTema anchoCompleto />
      </Card>

      <Card aria-labelledby="mas-cuenta" className="flex flex-col gap-1">
        <h2 id="mas-cuenta" className="mb-2 text-base font-semibold text-texto">
          {t('mas.cuenta')}
        </h2>
        {completo !== null && <p className="font-medium break-words text-texto">{completo}</p>}
        {email !== '' && <p className="text-sm break-all text-apagado">{email}</p>}
      </Card>

      <Button
        variante="secundario"
        anchoCompleto
        className="text-negativo"
        icono={<LogOut aria-hidden="true" className="size-4" />}
        cargando={saliendo}
        onClick={() => void salir()}
      >
        {t('cuenta.cerrarSesion')}
      </Button>
    </div>
  );
}
