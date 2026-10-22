import { useEffect, useReducer, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { TriangleAlert, X } from 'lucide-react';
import { api } from '@/app/api';
import { useUsuario } from '@/app/auth';
import { perfilApi, useObtenerPerfilQuery, type Perfil } from '@/app/perfilApi';
import type { AppDispatch } from '@/app/store';
import { useIdioma, useT, type Idioma } from '@/shared/i18n';
import { ENTIDADES, MAX_BANCOS, NOMBRE_ENTIDAD, type Entidad } from '@/shared/lib/bancos';
import { formatearEuros } from '@/shared/lib/dinero';
import { ZONA_POR_DEFECTO, formatearFecha, hoy } from '@/shared/lib/fechas';
import { BotonTema, Logo, useTituloDocumento } from '@/shared/layout';
import { BankLogo, Button } from '@/shared/ui';
import { claveErrorOnboarding, useCompletarOnboardingMutation, type ClaveErrorOnboarding } from '../api/onboardingApi';
import { SelectorBanco, type BancoElegido } from '../components/SelectorBanco';
import { SaldoInput } from '../components/SaldoInput';
import { SelectorIdioma } from '../components/SelectorIdioma';
import {
  PASOS_CON_NUMERO,
  caberMasBancos,
  construirPayload,
  entidadesDe,
  estadoInicial,
  reducerOnboarding,
  pasoValido,
  totalBancos,
} from '../hooks/estadoOnboarding';
import { leerSaldo, sumarSaldos, type ErrorSaldo } from '../schemas/saldo';

/** Nombre fijo con el que la base crea la cuenta de efectivo (no es un texto de la interfaz). */
const NOMBRE_CUENTA_EFECTIVO = 'Efectivo';

const CLAVE_ERROR_SALDO = {
  vacio: 'saldo.vacio',
  invalido: 'saldo.invalido',
  maximo: 'saldo.maximo',
} as const satisfies Record<ErrorSaldo, string>;

/** Entidades cuyo nombre ya usa otra cuenta (p. ej. un banco «Otro» llamado «BBVA»). */
function entidadesConNombreOcupado(ocupados: readonly string[]): Entidad[] {
  const claves = new Set(ocupados.map((n) => n.trim().toLocaleLowerCase()));
  return ENTIDADES.filter((e) => claves.has(NOMBRE_ENTIDAD[e].toLocaleLowerCase()));
}

export default function PaginaBienvenida() {
  const t = useT('onboarding');
  const { idioma, locale, setIdioma } = useIdioma();
  const usuario = useUsuario();
  const { data: perfil } = useObtenerPerfilQuery(usuario.id);
  const navigate = useNavigate();
  const dispatchRedux = useDispatch<AppDispatch>();
  const [estado, dispatch] = useReducer(reducerOnboarding, idioma, estadoInicial);
  const [completar, { isLoading: guardando }] = useCompletarOnboardingMutation();
  const [errorEnvio, setErrorEnvio] = useState<ClaveErrorOnboarding | null>(null);
  const enviando = useRef(false);
  const refTitulo = useRef<HTMLHeadingElement>(null);
  const refCampo = useRef<HTMLInputElement>(null);
  const primerPaso = useRef(true);

  useTituloDocumento(t('titulo'));

  const { paso, principal, extras, borrador, intentoFallido } = estado;

  // Al cambiar de paso, el foco va al título del paso (lectores de pantalla y teclado).
  useEffect(() => {
    if (primerPaso.current) {
      primerPaso.current = false;
      return;
    }
    refTitulo.current?.focus();
  }, [paso]);

  const elegirIdioma = (nuevo: Idioma) => {
    dispatch({ tipo: 'idioma', idioma: nuevo });
    setIdioma(nuevo);
  };

  const errorSaldo = (texto: string): string | undefined => {
    if (!intentoFallido) return undefined;
    const r = leerSaldo(texto, locale);
    return r.ok ? undefined : t(CLAVE_ERROR_SALDO[r.error]);
  };

  const formatear = (texto: string) => {
    const r = leerSaldo(texto, locale);
    return r.ok ? formatearEuros(r.valor, locale) : '';
  };

  /**
   * Marca el perfil en caché como completado antes de ir a «/»: así el guard no ve el perfil
   * antiguo (pendiente) mientras se vuelve a pedir y no rebota a /bienvenida.
   */
  const marcarCompletado = (cambios: Partial<Perfil>) => {
    dispatchRedux(
      perfilApi.util.updateQueryData('obtenerPerfil', usuario.id, (borrador) => {
        if (borrador) Object.assign(borrador, cambios, { onboarding_completado: true });
      }),
    );
  };

  const empezar = async () => {
    const payload = construirPayload(estado);
    if (payload === null || enviando.current) return;
    enviando.current = true;
    setErrorEnvio(null);
    try {
      await completar(payload).unwrap();
      marcarCompletado({ idioma: payload.p_idioma });
      navigate('/', { replace: true });
    } catch (e) {
      const clave = claveErrorOnboarding(e as Parameters<typeof claveErrorOnboarding>[0]);
      if (clave === 'error.yaCompletado') {
        toast(t(clave));
        marcarCompletado({});
        dispatchRedux(api.util.invalidateTags(['Perfil', 'Cuentas', 'Categorias']));
        navigate('/', { replace: true });
        return;
      }
      setErrorEnvio(clave);
      enviando.current = false;
    }
  };

  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (paso === 6) void empezar();
    else {
      // Si no puede avanzar, el foco va al campo con el error.
      if (!pasoValido(estado)) refCampo.current?.focus();
      dispatch({ tipo: 'siguiente' });
    }
  };

  const nombresElegidos = [
    ...(principal ? [principal.nombre] : []),
    ...extras.map((x) => x.banco.nombre),
    NOMBRE_CUENTA_EFECTIVO,
  ];
  const nombrePrincipal = principal?.nombre ?? '';

  let titulo: string;
  let descripcion: string | null;
  let contenido: ReactNode;

  switch (paso) {
    case 1:
      titulo = t('idioma.titulo');
      descripcion = t('idioma.descripcion');
      contenido = <SelectorIdioma etiqueta={titulo} valor={estado.idioma} onCambio={elegirIdioma} />;
      break;

    case 2: {
      const ocupados = extras.map((x) => x.banco.nombre).concat(NOMBRE_CUENTA_EFECTIVO);
      titulo = t('principal.titulo');
      descripcion = t('principal.descripcion');
      contenido = (
        <>
          <SelectorBanco
            excluir={[...entidadesDe(extras.map((x) => x.banco)), ...entidadesConNombreOcupado(ocupados)]}
            nombresOcupados={ocupados}
            valor={principal}
            onCambio={(banco) => dispatch({ tipo: 'principal', banco })}
          />
          {intentoFallido && principal === null && <Alerta mensaje={t('principal.error')} />}
        </>
      );
      break;
    }

    case 3:
      titulo = t('saldo.titulo', { banco: nombrePrincipal });
      descripcion = t('saldo.descripcion');
      contenido = (
        <SaldoInput
          ref={refCampo}
          label={t('saldo.etiqueta')}
          ayuda={t('saldo.ayuda')}
          value={estado.saldoPrincipal}
          onChange={(texto) => dispatch({ tipo: 'saldoPrincipal', texto })}
          error={errorSaldo(estado.saldoPrincipal)}
          className="[&_input]:h-15 [&_input]:text-2xl [&_input]:font-bold"
        />
      );
      break;

    case 4: {
      const hayHueco = caberMasBancos(estado);
      const huecoTrasBorrador = totalBancos(estado) + 1 < MAX_BANCOS;
      titulo = t('otros.titulo');
      descripcion = t('otros.descripcion', { max: MAX_BANCOS });
      contenido = (
        <>
          {extras.length > 0 && (
            <section aria-label={t('otros.anadidos')}>
              <ul className="flex flex-col divide-y divide-borde rounded-2xl border border-borde bg-superficie px-4">
                {extras.map((x, i) => (
                  <li key={`${x.banco.entidad ?? 'otro'}-${x.banco.nombre}`} className="flex items-center gap-3 py-3">
                    <BankLogo entidad={x.banco.entidad} nombre={x.banco.nombre} color={x.banco.color} tamano="sm" />
                    <span className="min-w-0 flex-1 truncate text-texto">{x.banco.nombre}</span>
                    <span className="text-texto tabular-nums">{formatear(x.saldo)}</span>
                    <button
                      type="button"
                      onClick={() => dispatch({ tipo: 'quitarExtra', indice: i })}
                      aria-label={t('accion.quitar', { banco: x.banco.nombre })}
                      className="rounded-lg p-1.5 text-apagado transition-colors hover:bg-superficie-2 hover:text-texto"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hayHueco ? (
            <>
              <SelectorBanco
                key={extras.length}
                excluir={[
                  ...entidadesDe([principal, ...extras.map((x) => x.banco)]),
                  ...entidadesConNombreOcupado(nombresElegidos),
                ]}
                nombresOcupados={nombresElegidos}
                valor={borrador}
                onCambio={(banco: BancoElegido | null) => dispatch({ tipo: 'borrador', banco })}
              />
              {borrador !== null && (
                <div className="flex flex-col gap-3">
                  <SaldoInput
                    ref={refCampo}
                    label={t('otros.saldoEtiqueta', { banco: borrador.nombre })}
                    value={estado.saldoBorrador}
                    onChange={(texto) => dispatch({ tipo: 'saldoBorrador', texto })}
                    error={errorSaldo(estado.saldoBorrador)}
                    className="[&_input]:h-13 [&_input]:text-xl [&_input]:font-bold"
                  />
                  {huecoTrasBorrador && (
                    <Button
                      variante="secundario"
                      onClick={() => {
                        if (!pasoValido(estado)) refCampo.current?.focus();
                        dispatch({ tipo: 'anadirBorrador' });
                      }}
                    >
                      {t('accion.anadirOtro')}
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p role="status" className="rounded-xl border border-borde bg-superficie-2 px-4 py-3 text-sm text-apagado">
              {t('otros.limite', { max: MAX_BANCOS })}
            </p>
          )}
        </>
      );
      break;
    }

    case 5:
      titulo = t('efectivo.titulo');
      descripcion = t('efectivo.descripcion');
      contenido = (
        <SaldoInput
          ref={refCampo}
          label={t('efectivo.etiqueta')}
          value={estado.efectivo}
          onChange={(texto) => dispatch({ tipo: 'efectivo', texto })}
          error={errorSaldo(estado.efectivo)}
          className="[&_input]:h-15 [&_input]:text-2xl [&_input]:font-bold"
        />
      );
      break;

    case 6: {
      const payload = construirPayload(estado);
      const total = payload ? sumarSaldos([...payload.p_bancos.map((b) => b.saldo), payload.p_efectivo]) : null;
      const fecha = formatearFecha(hoy(perfil?.zona_horaria ?? ZONA_POR_DEFECTO), locale, 'corta');
      titulo = t('resumen.titulo');
      descripcion = t('resumen.descripcion');
      contenido = (
        <>
          <dl className="flex flex-col rounded-2xl border border-borde bg-superficie px-4 py-1.5">
            {payload?.p_bancos.map((b, i) => (
              <div
                key={`${b.entidad ?? 'otro'}-${b.nombre}`}
                className="flex items-center gap-3 border-b border-borde py-3"
              >
                <dt className="flex min-w-0 flex-1 items-center gap-3">
                  <BankLogo entidad={b.entidad} nombre={b.nombre} color={b.color} tamano="sm" />
                  <span className="truncate text-texto">{b.nombre}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-acento-suave px-2 py-0.5 text-xs font-medium text-acento">
                      {t('resumen.principal')}
                    </span>
                  )}
                </dt>
                <dd className="text-texto tabular-nums">{formatearEuros(b.saldo, locale)}</dd>
              </div>
            ))}
            {payload && (
              <div className="flex items-center gap-3 py-3">
                <dt className="flex-1 text-texto">{t('resumen.efectivo')}</dt>
                <dd className="text-texto tabular-nums">{formatearEuros(payload.p_efectivo, locale)}</dd>
              </div>
            )}
            {total !== null && (
              <div
                className="flex items-center gap-3 border-t border-borde-fuerte py-3.5 font-bold"
                data-testid="patrimonio"
              >
                <dt className="flex-1 text-texto">{t('resumen.patrimonio', { fecha })}</dt>
                <dd className="text-texto tabular-nums">{formatearEuros(total, locale)}</dd>
              </div>
            )}
          </dl>
          {errorEnvio !== null && <Alerta mensaje={t(errorEnvio, { max: MAX_BANCOS })} />}
        </>
      );
      break;
    }
  }

  const textoPaso =
    paso <= PASOS_CON_NUMERO ? t('progreso.paso', { paso, total: PASOS_CON_NUMERO }) : t('progreso.resumen');
  const porcentaje = Math.min(100, Math.round((paso / PASOS_CON_NUMERO) * 100));

  return (
    <div className="flex min-h-dvh flex-col bg-fondo px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
      <form noValidate onSubmit={alEnviar} className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Logo />
            <div className="flex items-center gap-2">
              <span className="text-sm text-apagado" aria-hidden="true">
                {textoPaso}
              </span>
              <BotonTema />
            </div>
          </div>
          <div
            role="progressbar"
            aria-label={t('progreso.etiqueta')}
            aria-valuemin={1}
            aria-valuemax={PASOS_CON_NUMERO}
            aria-valuenow={Math.min(paso, PASOS_CON_NUMERO)}
            aria-valuetext={textoPaso}
            className="h-1.5 overflow-hidden rounded-full bg-superficie-3"
          >
            <div className="h-full rounded-full bg-acento transition-[width]" style={{ width: `${porcentaje}%` }} />
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4">
          <h1 className="sr-only">{t('titulo')}</h1>
          <div className="flex flex-col gap-1.5">
            <h2
              ref={refTitulo}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight text-texto focus:outline-none sm:text-3xl"
            >
              {titulo}
            </h2>
            {descripcion !== null && <p className="text-[15px] text-apagado">{descripcion}</p>}
          </div>
          {contenido}
        </main>

        <footer className="sticky bottom-0 flex gap-2.5 bg-fondo pt-2">
          {paso > 1 && (
            <Button variante="secundario" tamano="lg" onClick={() => dispatch({ tipo: 'atras' })} disabled={guardando}>
              {t('accion.atras')}
            </Button>
          )}
          {paso === 4 && extras.length === 0 && (
            <Button variante="secundario" tamano="lg" onClick={() => dispatch({ tipo: 'saltar' })}>
              {t('accion.saltar')}
            </Button>
          )}
          <Button type="submit" tamano="lg" className="flex-1" cargando={guardando}>
            {paso === 6 ? t('accion.empezar') : t('accion.siguiente')}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function Alerta({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-negativo/30 bg-negativo-suave px-3 py-2.5 text-sm text-negativo"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{mensaje}</span>
    </div>
  );
}
