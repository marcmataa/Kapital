import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Cuenta } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { MAX_BANCOS } from '@/shared/lib/bancos';
import { formatearEuros } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { Badge, BankLogo, Button, Card } from '@/shared/ui';
import { SheetAnadirBanco } from './SheetAnadirBanco';
import { SheetBanco } from './SheetBanco';

interface Props {
  cuentas: readonly Cuenta[];
}

/** «Mis bancos»: abiertos (máx. 5), alta, principal y cierre. Los cerrados, plegados. */
export function SeccionBancos({ cuentas }: Props) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const [anadiendo, setAnadiendo] = useState(false);
  const [gestionando, setGestionando] = useState<string | null>(null);

  const bancos = cuentas.filter((c) => c.tipo === 'banco');
  const abiertos = bancos.filter((c) => c.fecha_cierre === null);
  const cerrados = bancos.filter((c) => c.fecha_cierre !== null);
  const principalId = cuentas.find((c) => c.es_principal)?.id ?? null;
  const enLimite = abiertos.length >= MAX_BANCOS;
  const seleccionado = abiertos.find((c) => c.id === gestionando) ?? null;

  return (
    <Card aria-labelledby="config-bancos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="config-bancos" className="text-base font-semibold text-texto">
            {t('bancos.titulo')}
          </h2>
          <p className="mt-1 text-sm text-apagado">
            {t('bancos.contador', { n: abiertos.length, max: MAX_BANCOS })}
          </p>
        </div>
        <Button
          onClick={() => setAnadiendo(true)}
          disabled={enLimite}
          aria-describedby={enLimite ? 'config-bancos-limite' : undefined}
        >
          {t('bancos.anadir')}
        </Button>
      </div>
      {enLimite && (
        <p id="config-bancos-limite" className="text-sm text-aviso">
          {t('bancos.limite', { max: MAX_BANCOS })}
        </p>
      )}

      {abiertos.length === 0 ? (
        <p className="border-t border-borde pt-3 text-sm text-apagado">{t('bancos.vacio')}</p>
      ) : (
        <ul className="flex flex-col">
          {abiertos.map((c) => (
            <li key={c.id} className="flex items-center gap-3 border-t border-borde py-3">
              <BankLogo entidad={c.entidad} nombre={c.nombre} color={c.color} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-texto">
                  <span className="truncate">{c.nombre}</span>
                  {c.es_principal && <Badge tono="acento">{t('bancos.principal')}</Badge>}
                </span>
                <span className="text-sm text-apagado">
                  {t('bancos.desde', { fecha: formatearFecha(c.fecha_inicial, locale, 'corta') })}
                </span>
              </div>
              <span className="font-semibold text-texto tabular-nums">
                {c.valor === null ? t('bancos.sinValor') : formatearEuros(c.valor, locale)}
              </span>
              <button
                type="button"
                onClick={() => setGestionando(c.id)}
                aria-label={t('bancos.gestionar', { nombre: c.nombre })}
                className="-mr-1 rounded-lg p-2 text-apagado transition-colors hover:bg-superficie-2 hover:text-texto"
              >
                <ChevronRight aria-hidden="true" className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {cerrados.length > 0 && (
        <details className="group border-t border-borde pt-3">
          <summary className="cursor-pointer text-sm font-medium text-apagado hover:text-texto">
            {t('bancos.cerrados', { n: cerrados.length })}
          </summary>
          <ul className="mt-2 flex flex-col">
            {cerrados.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 opacity-80">
                <BankLogo entidad={c.entidad} nombre={c.nombre} color={c.color} tamano="sm" />
                <span className="flex-1 truncate text-sm text-texto">{c.nombre}</span>
                <span className="text-xs text-apagado">
                  {t('bancos.cerradoEl', { fecha: formatearFecha(c.fecha_cierre ?? c.fecha_inicial, locale, 'corta') })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {anadiendo && <SheetAnadirBanco cuentas={cuentas} onCerrar={() => setAnadiendo(false)} />}
      {seleccionado !== null && (
        <SheetBanco
          cuenta={seleccionado}
          principalId={principalId}
          abiertos={abiertos.length}
          onCerrar={() => setGestionando(null)}
        />
      )}
    </Card>
  );
}
