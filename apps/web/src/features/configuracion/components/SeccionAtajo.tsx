import { useState } from 'react';
import toast from 'react-hot-toast';
import { useIdioma, useT } from '@/shared/i18n';
import { configApp } from '@/shared/lib/env';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { Badge, Button, Card, Sheet, Spinner } from '@/shared/ui';
import { useConfigListarTokensQuery, useConfigRevocarTokenMutation, type TokenApi } from '../api/configuracionApi';
import { claveError } from '../api/errores';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { AlertaError } from './AlertaError';
import { DialogoCrearToken } from './DialogoCrearToken';

/** Campos del cuerpo de `registrar_movimiento` (nombres de la API, no se traducen). */
const CAMPOS = [
  ['token', 'atajo.campoToken'],
  ['tipo', 'atajo.campoTipo'],
  ['importe', 'atajo.campoImporte'],
  ['concepto', 'atajo.campoConcepto'],
  ['categoria', 'atajo.campoCategoria'],
  ['metodo', 'atajo.campoMetodo'],
  ['fecha', 'atajo.campoFecha'],
  ['comercio', 'atajo.campoComercio'],
  ['desde', 'atajo.campoDesde'],
  ['hacia', 'atajo.campoHacia'],
  ['clave', 'atajo.campoClave'],
] as const;

/** URL pública del RPC del atajo (la URL del proyecto no es secreta; la clave no se muestra). */
export function urlAtajo(): string {
  const base = configApp.ok ? configApp.config.url.replace(/\/+$/, '') : '<VITE_SUPABASE_URL>';
  return `${base}/rest/v1/rpc/registrar_movimiento`;
}

function ConfirmarRevocar({ token, onCerrar }: { token: TokenApi; onCerrar: () => void }) {
  const t = useT('configuracion');
  const [revocar, { isLoading }] = useConfigRevocarTokenMutation();
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    setError(null);
    try {
      await revocar(token.id).unwrap();
      toast.success(t('atajo.revocadoHecho'));
      onCerrar();
    } catch (e) {
      setError(t(claveError(e)));
    }
  };

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={t('atajo.revocarTitulo')}
      pie={
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={onCerrar}>
            {t('accion.cancelar')}
          </Button>
          <Button variante="peligro" cargando={isLoading} onClick={() => void confirmar()}>
            {t('atajo.revocarSi')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto">{t('atajo.revocarConfirmar', { nombre: token.nombre })}</p>
        <AlertaError mensaje={error} />
      </div>
    </Sheet>
  );
}

/** Tokens del atajo del iPhone: lista (sin hash), crear (se ve una vez), revocar e instrucciones. */
export function SeccionAtajo() {
  const t = useT('configuracion');
  const tc = useT('common');
  const { locale } = useIdioma();
  const { zona } = useHoyUsuario();
  const { data: tokens, isLoading, isError, refetch } = useConfigListarTokensQuery();
  const [creando, setCreando] = useState(false);
  const [revocando, setRevocando] = useState<TokenApi | null>(null);

  return (
    <Card aria-labelledby="config-atajo" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="config-atajo" className="text-base font-semibold text-texto">
            {t('atajo.titulo')}
          </h2>
          <p className="mt-1 text-sm text-apagado">{t('atajo.descripcion')}</p>
        </div>
        <Button variante="secundario" onClick={() => setCreando(true)}>
          {t('atajo.crear')}
        </Button>
      </div>

      {isLoading ? (
        <Spinner className="self-start" />
      ) : isError ? (
        <div className="flex items-center gap-3 border-t border-borde pt-3">
          <p className="text-sm text-negativo">{t('error.carga')}</p>
          <Button variante="fantasma" tamano="sm" onClick={() => void refetch()}>
            {tc('accion.reintentar')}
          </Button>
        </div>
      ) : tokens === undefined || tokens.length === 0 ? (
        <p className="border-t border-borde pt-3 text-sm text-apagado">{t('atajo.vacio')}</p>
      ) : (
        <ul className="flex flex-col">
          {tokens.map((tk) => (
            <li key={tk.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-borde py-3">
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-semibold text-texto">
                  <span className="truncate">{tk.nombre}</span>
                  {tk.revocado && <Badge tono="negativo">{t('atajo.revocado')}</Badge>}
                </span>
                <span className="text-sm text-apagado">
                  {tk.ultimo_uso === null
                    ? t('atajo.sinUso')
                    : t('atajo.ultimoUso', { fecha: formatearFechaHora(tk.ultimo_uso, locale, zona) })}
                  {' · '}
                  {t('atajo.creado', { fecha: formatearFechaHora(tk.created_at, locale, zona) })}
                </span>
              </div>
              {!tk.revocado && (
                <Button
                  variante="secundario"
                  tamano="sm"
                  aria-label={t('atajo.revocarNombre', { nombre: tk.nombre })}
                  onClick={() => setRevocando(tk)}
                >
                  {t('atajo.revocar')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="border-t border-borde pt-3">
        <summary className="cursor-pointer text-sm font-medium text-enlace">{t('atajo.instrucciones')}</summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-apagado">
          <li>{t('atajo.paso1')}</li>
          <li>
            {t('atajo.paso2')}{' '}
            <code className="rounded bg-superficie-2 px-1.5 py-0.5 font-mono text-xs break-all text-texto">
              {urlAtajo()}
            </code>
          </li>
          <li>{t('atajo.paso3')}</li>
          <li>
            {t('atajo.paso4')}
            <ul className="mt-1 flex flex-col gap-1">
              {CAMPOS.map(([campo, clave]) => (
                <li key={campo}>
                  <code className="font-mono text-xs text-texto">{campo}</code>: {t(clave)}
                </li>
              ))}
            </ul>
          </li>
          <li>{t('atajo.paso5')}</li>
        </ol>
      </details>

      {creando && <DialogoCrearToken onCerrar={() => setCreando(false)} />}
      {revocando !== null && <ConfirmarRevocar token={revocando} onCerrar={() => setRevocando(null)} />}
    </Card>
  );
}
