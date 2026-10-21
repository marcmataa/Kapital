import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useListarCuentasQuery } from '@/shared/api/catalogos';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { sumarMeses } from '@/shared/lib/fechas';
import { Badge, Button, Card, Spinner, type TonoBadge } from '@/shared/ui';
import { useAnalisisListarQuery } from '../api/analisisApi';
import { BotonGenerar } from '../components/BotonGenerar';
import { useLocale } from '../hooks/useLocale';
import { diaMes, etiquetaMes } from '../lib/formato';
import { entradasMeses, inicioDeDatos, rutaDeMes } from '../lib/meses';
import type { EstadoAnalisis } from '../schemas/esquemas';

const TONO_ESTADO: Record<EstadoAnalisis, TonoBadge> = {
  listo: 'positivo',
  pendiente: 'aviso',
  generando: 'aviso',
  error: 'negativo',
};

export default function PaginaAnalisis() {
  const t = useT('analisis');
  const tc = useT('common');
  const locale = useLocale();
  const { hoy } = useHoyUsuario();
  const lista = useAnalisisListarQuery();
  const cuentas = useListarCuentasQuery();

  const cargando = lista.isLoading || cuentas.isLoading;
  const fallo = (lista.isError && !lista.data) || (cuentas.isError && !cuentas.data);
  const entradas = lista.data && cuentas.data ? entradasMeses(hoy, inicioDeDatos(cuentas.data), lista.data) : [];

  return (
    <>
      <CabeceraPagina titulo={t('titulo')} descripcion={t('lista.descripcion')} />
      {cargando ? (
        <div className="flex justify-center py-10">
          <Spinner tamano="lg" />
        </div>
      ) : fallo ? (
        <Card>
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>{tc('error.generico')}</span>
            <Button
              variante="secundario"
              tamano="sm"
              onClick={() => {
                void lista.refetch();
                void cuentas.refetch();
              }}
            >
              {tc('accion.reintentar')}
            </Button>
          </div>
        </Card>
      ) : (
        <Card sinPadding>
          <ul className="divide-y divide-borde">
            {entradas.map((e) => (
              <li key={e.mes} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                {e.tipo === 'fila' ? (
                  <Link
                    to={rutaDeMes(e.mes)}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg text-texto"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium group-hover:underline">{etiquetaMes(e.mes, locale)}</span>
                      <Badge tono={TONO_ESTADO[e.fila.estado]}>{t(`estado.${e.fila.estado}`)}</Badge>
                      {e.fila.mes_incompleto && <Badge tono="neutro">{t('lista.incompleto')}</Badge>}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-apagado" />
                  </Link>
                ) : (
                  <>
                    <span className="font-medium text-texto">{etiquetaMes(e.mes, locale)}</span>
                    {e.tipo === 'en_curso' ? (
                      <span className="text-sm text-apagado">
                        {t('lista.seGenera', { fecha: diaMes(sumarMeses(e.mes, 1), locale) })}
                      </span>
                    ) : (
                      <BotonGenerar mes={e.mes} modo="primera" />
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
