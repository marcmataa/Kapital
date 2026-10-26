import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import {
  ChevronRight,
  Languages,
  Landmark,
  LogOut,
  Palette,
  Smartphone,
  Tags,
  Target,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  useListarCategoriasQuery,
  useListarCuentasQuery,
  useListarObjetivosQuery,
} from '@/shared/api/catalogos';
import { useCerrarSesion } from '@/shared/hooks/useCerrarSesion';
import { useT, type ClaveDe } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { Button, Card, Spinner } from '@/shared/ui';
import { SeccionApariencia, SeccionCuenta } from '../components/SeccionAparienciaCuenta';
import { SeccionAtajo } from '../components/SeccionAtajo';
import { SeccionBancos } from '../components/SeccionBancos';
import { SeccionIdioma } from '../components/SeccionIdioma';
import { SeccionResumen, TarjetaCategorias, TarjetaEfectivo, TarjetaObjetivos } from '../components/SeccionResumen';
import { useEsEscritorio } from '../hooks/useEsEscritorio';

/** Secciones de Configuración, en el orden de la lista del móvil. */
const SECCIONES = ['idioma', 'bancos', 'efectivo', 'categorias', 'objetivos', 'atajo', 'apariencia', 'cuenta'] as const;
type SeccionConfig = (typeof SECCIONES)[number];

const ITEMS: Record<SeccionConfig, { titulo: ClaveDe<'configuracion'>; icono: LucideIcon }> = {
  idioma: { titulo: 'idioma.titulo', icono: Languages },
  bancos: { titulo: 'bancos.titulo', icono: Landmark },
  efectivo: { titulo: 'efectivo.titulo', icono: Wallet },
  categorias: { titulo: 'categorias.titulo', icono: Tags },
  objetivos: { titulo: 'objetivos.titulo', icono: Target },
  atajo: { titulo: 'atajo.titulo', icono: Smartphone },
  apariencia: { titulo: 'apariencia.titulo', icono: Palette },
  cuenta: { titulo: 'cuenta.titulo', icono: UserRound },
};

function esSeccion(valor: string | undefined): valor is SeccionConfig {
  return (SECCIONES as readonly string[]).includes(valor ?? '');
}

/** Catálogos que usan las secciones; un solo sitio para el spinner y el error de carga. */
function useCatalogos() {
  const cuentas = useListarCuentasQuery();
  const categorias = useListarCategoriasQuery();
  const objetivos = useListarObjetivosQuery();
  return {
    cuentas: cuentas.data ?? [],
    categorias: categorias.data ?? [],
    objetivos: objetivos.data ?? [],
    cargando: cuentas.isLoading || categorias.isLoading || objetivos.isLoading,
    error: cuentas.isError || categorias.isError || objetivos.isError,
    reintentar: () => {
      if (cuentas.isError) void cuentas.refetch();
      if (categorias.isError) void categorias.refetch();
      if (objetivos.isError) void objetivos.refetch();
    },
  };
}

function ConCatalogos({ catalogos, children }: { catalogos: ReturnType<typeof useCatalogos>; children: ReactNode }) {
  const t = useT('configuracion');
  const tc = useT('common');
  if (catalogos.cargando) {
    return (
      <Card className="flex justify-center">
        <Spinner />
      </Card>
    );
  }
  if (catalogos.error) {
    return (
      <Card role="alert" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-negativo">{t('error.carga')}</p>
        <Button variante="secundario" tamano="sm" onClick={catalogos.reintentar}>
          {tc('accion.reintentar')}
        </Button>
      </Card>
    );
  }
  return <>{children}</>;
}

/** Móvil: lista tipo Ajustes de iOS; cada fila abre su sección en su propia pantalla. */
function MenuMovil() {
  const t = useT('configuracion');
  const { salir, saliendo } = useCerrarSesion();
  return (
    <div className="flex flex-col gap-4">
      <CabeceraPagina titulo={t('titulo')} />
      <nav aria-label={t('titulo')}>
        <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
          {SECCIONES.map((s) => {
            const { titulo, icono: Icono } = ITEMS[s];
            return (
              <li key={s}>
                <Link
                  to={`/configuracion/${s}`}
                  className="flex min-h-12 items-center gap-3 px-4 py-3 text-texto active:bg-superficie-2"
                >
                  <Icono aria-hidden="true" className="size-5 text-apagado" />
                  <span className="flex-1 font-medium">{t(titulo)}</span>
                  <ChevronRight aria-hidden="true" className="size-4 text-apagado" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Button
        variante="secundario"
        anchoCompleto
        className="text-negativo"
        cargando={saliendo}
        icono={<LogOut aria-hidden="true" className="size-4" />}
        onClick={() => void salir()}
      >
        {t('cuenta.cerrarSesion')}
      </Button>
    </div>
  );
}

function Seccion({ seccion, catalogos }: { seccion: SeccionConfig; catalogos: ReturnType<typeof useCatalogos> }) {
  const { cuentas, categorias, objetivos } = catalogos;
  switch (seccion) {
    case 'idioma':
      return <SeccionIdioma />;
    case 'atajo':
      return <SeccionAtajo />;
    case 'apariencia':
      return <SeccionApariencia />;
    case 'bancos':
      return (
        <ConCatalogos catalogos={catalogos}>
          <SeccionBancos cuentas={cuentas} />
        </ConCatalogos>
      );
    case 'efectivo':
      return (
        <ConCatalogos catalogos={catalogos}>
          <TarjetaEfectivo cuentas={cuentas} />
        </ConCatalogos>
      );
    case 'categorias':
      return (
        <ConCatalogos catalogos={catalogos}>
          <TarjetaCategorias categorias={categorias} />
        </ConCatalogos>
      );
    case 'objetivos':
      return (
        <ConCatalogos catalogos={catalogos}>
          <TarjetaObjetivos categorias={categorias} objetivos={objetivos} />
        </ConCatalogos>
      );
    case 'cuenta':
      return (
        <ConCatalogos catalogos={catalogos}>
          <SeccionCuenta cuentas={cuentas} categorias={categorias} />
        </ConCatalogos>
      );
  }
}

export default function PaginaConfiguracion() {
  const t = useT('configuracion');
  const { seccion } = useParams();
  const escritorio = useEsEscritorio();
  const catalogos = useCatalogos();

  if (!escritorio) {
    if (seccion === undefined) return <MenuMovil />;
    if (!esSeccion(seccion)) return <Navigate to="/configuracion" replace />;
    return (
      <div className="flex flex-col gap-4">
        <CabeceraPagina titulo={t(ITEMS[seccion].titulo)} volverA="/configuracion" />
        <Seccion seccion={seccion} catalogos={catalogos} />
      </div>
    );
  }

  // Escritorio: todo en una página (una subruta /configuracion/<sección> muestra lo mismo).
  return (
    <div className="flex w-full flex-col gap-4">
      <CabeceraPagina titulo={t('titulo')} />
      <SeccionIdioma />
      <ConCatalogos catalogos={catalogos}>
        <SeccionBancos cuentas={catalogos.cuentas} />
        <SeccionResumen cuentas={catalogos.cuentas} categorias={catalogos.categorias} objetivos={catalogos.objetivos} />
      </ConCatalogos>
      <SeccionAtajo />
      <div className="grid gap-4 md:grid-cols-2">
        <SeccionApariencia />
        <ConCatalogos catalogos={catalogos}>
          <SeccionCuenta cuentas={catalogos.cuentas} categorias={catalogos.categorias} />
        </ConCatalogos>
      </div>
    </div>
  );
}
