import { useParams } from 'react-router';
import { AlertTriangle, Clock } from 'lucide-react';
import { useListarCuentasQuery } from '@/shared/api/catalogos';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { useIdioma, useT } from '@/shared/i18n';
import { CabeceraPagina } from '@/shared/layout';
import { formatearFechaHora, formatearMes, inicioDeMes, sumarMeses } from '@/shared/lib/fechas';
import { Button, Card, EmptyState, Spinner } from '@/shared/ui';
import { useAnalisisListarQuery, useAnalisisObtenerQuery, type AnalisisDetalle } from '../api/analisisApi';
import { BotonGenerar } from '../components/BotonGenerar';
import { CategoriasMes } from '../components/CategoriasMes';
import { ChipsMeses } from '../components/ChipsMeses';
import { CifrasMes } from '../components/CifrasMes';
import { ComentarioIA } from '../components/ComentarioIA';
import { GraficoCascada } from '../components/GraficoCascada';
import { useAhora } from '../hooks/useAhora';
import { useLocale } from '../hooks/useLocale';
import { useSondeoAnalisis } from '../hooks/useSondeoAnalisis';
import { accionAnalisis } from '../lib/acciones';
import { diaMes } from '../lib/formato';
import { entradasMeses, esGenerable, inicioDeDatos, mesDeRuta } from '../lib/meses';
import type { ContenidoAnalisis, DatosAnalisis } from '../schemas/esquemas';

export default function PaginaAnalisisMes() {
  const t = useT('analisis');
  const { mes: parametro } = useParams();
  const mes = mesDeRuta(parametro);
  const locale = useLocale();
  const titulo = mes === null ? t('titulo') : t('detalle.titulo', { mes: formatearMes(mes, locale) });

  return (
    <>
      <CabeceraPagina titulo={titulo} />
      {mes === null ? (
        <Card>
          <EmptyState titulo={t('detalle.mesInvalido')} />
        </Card>
      ) : (
        <DetalleMes mes={mes} />
      )}
    </>
  );
}

function DetalleMes({ mes }: { mes: string }) {
  const t = useT('analisis');
  const { idioma } = useIdioma();
  const tc = useT('common');
  const { hoy } = useHoyUsuario();
  const cuentas = useListarCuentasQuery();
  const lista = useAnalisisListarQuery();
  const inicioDatos = cuentas.data ? inicioDeDatos(cuentas.data) : null;

  const ahora = useAhora();

  // Primero sin sondeo; si la fila está pendiente o generando (y no atascada), se sondea cada 5 s (máx. ~2 min).
  const consultaInicial = useAnalisisObtenerQuery(mes);
  const enProceso = consultaInicial.data ? accionAnalisis(consultaInicial.data, ahora) === 'esperar' : false;
  const sondeo = useSondeoAnalisis(enProceso, () => {
    void consultaInicial.refetch();
    void lista.refetch();
  });
  const consulta = useAnalisisObtenerQuery(mes, { pollingInterval: sondeo.intervalo, skipPollingIfUnfocused: false });
  const { data: analisis, isLoading, isError, refetch } = consulta;

  const chips =
    lista.data && cuentas.data ? <ChipsMeses entradas={entradasMeses(hoy, inicioDatos, lista.data)} seleccionado={mes} /> : null;

  let cuerpo;
  if (isLoading) {
    cuerpo = (
      <div className="flex justify-center py-10">
        <Spinner tamano="lg" />
      </div>
    );
  } else if (isError && analisis === undefined) {
    cuerpo = (
      <Card>
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>{tc('error.generico')}</span>
          <Button variante="secundario" tamano="sm" onClick={() => void refetch()}>
            {tc('accion.reintentar')}
          </Button>
        </div>
      </Card>
    );
  } else if (analisis === null || analisis === undefined) {
    cuerpo = <SinAnalisis mes={mes} hoy={hoy} inicioDatos={inicioDatos} cargandoCuentas={cuentas.isLoading} />;
  } else if (analisis.estado !== 'listo' && accionAnalisis(analisis, ahora) === 'reintentar') {
    // Falló (quedan reintentos) o lleva más de 15 min atascado: «Reintentar» no consume la regeneración.
    cuerpo = (
      <Card>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p role="status" className="text-texto">
            {analisis.estado === 'error' ? t('detalle.errorEstado') : t('detalle.atascado')}
          </p>
          <BotonGenerar mes={mes} modo="reintentar" />
        </div>
      </Card>
    );
  } else if (analisis.estado === 'pendiente' || analisis.estado === 'generando') {
    cuerpo = (
      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
          {sondeo.agotado ? (
            <>
              <Clock aria-hidden="true" className="size-8 text-apagado" />
              <p className="text-texto">{t('detalle.tardando')}</p>
              <Button variante="secundario" tamano="sm" onClick={() => { sondeo.reiniciar(); void refetch(); }}>
                {t('detalle.comprobar')}
              </Button>
            </>
          ) : (
            <>
              <Spinner tamano="lg" />
              <p className="text-texto">{t('detalle.generando')}</p>
            </>
          )}
        </div>
      </Card>
    );
  } else if (analisis.estado === 'error') {
    cuerpo = (
      <Card>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p role="status" className="text-texto">{t('detalle.sinReintentos')}</p>
        </div>
      </Card>
    );
  } else if (analisis.invalido || analisis.datos === null || analisis.contenido === null) {
    cuerpo = (
      <Card>
        <p role="alert" className="py-6 text-center text-texto">{t('detalle.invalido')}</p>
      </Card>
    );
  } else {
    // El texto de la IA en el idioma de la interfaz: cambia al momento al cambiar de idioma.
    cuerpo = <AnalisisListo analisis={analisis} datos={analisis.datos} contenido={analisis.contenido[idioma]} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {chips}
      {cuerpo}
    </div>
  );
}

function SinAnalisis({
  mes,
  hoy,
  inicioDatos,
  cargandoCuentas,
}: {
  mes: string;
  hoy: string;
  inicioDatos: string | null;
  cargandoCuentas: boolean;
}) {
  const t = useT('analisis');
  const locale = useLocale();
  if (cargandoCuentas) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (mes === inicioDeMes(hoy)) {
    return (
      <Card>
        <EmptyState
          titulo={t('detalle.enCurso', { fecha: diaMes(sumarMeses(mes, 1), locale) })}
          icono={<Clock className="size-6" />}
        />
      </Card>
    );
  }
  if (esGenerable(mes, hoy, inicioDatos)) {
    return (
      <Card>
        <EmptyState
          titulo={t('detalle.sinGenerar')}
          descripcion={t('detalle.sinGenerarDescripcion')}
          accion={<BotonGenerar mes={mes} modo="primera" />}
        />
      </Card>
    );
  }
  return (
    <Card>
      <EmptyState titulo={t('detalle.noDisponible')} />
    </Card>
  );
}

function AnalisisListo({
  analisis,
  datos,
  contenido,
}: {
  analisis: AnalisisDetalle;
  datos: DatosAnalisis;
  contenido: ContenidoAnalisis;
}) {
  const t = useT('analisis');
  const locale = useLocale();
  const { zona } = useHoyUsuario();
  return (
    <>
      {analisis.mes_incompleto && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-aviso-borde bg-aviso-suave px-4 py-3.5 text-sm text-aviso"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{t('detalle.mesIncompleto')}</span>
        </div>
      )}
      <CifrasMes datos={datos} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GraficoCascada pasos={datos.cascada} />
        <CategoriasMes datos={datos} />
      </div>
      <ComentarioIA
        contenido={contenido}
        pie={
          <>
            <span className="text-xs text-apagado sm:text-sm">
              {analisis.generado_at !== null &&
                t('detalle.generadoEl', { fecha: formatearFechaHora(analisis.generado_at, locale, zona) })}
            </span>
            <BotonGenerar mes={analisis.mes} modo="regenerar" regeneraciones={analisis.regeneraciones} />
          </>
        }
      />
    </>
  );
}
