import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Lock } from 'lucide-react';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { ZONA_POR_DEFECTO, fechaEnZona, formatearFecha } from '@/shared/lib/fechas';
import { Button, clasesBoton } from '@/shared/ui';
import { useMovimientosObtenerQuery } from '../api/movimientosApi';
import type { Catalogos } from '../hooks/useCatalogos';
import { CLASE_TONO, importeConSigno, tonoImporte } from '../lib/presentacion';
import type { Movimiento } from '../lib/tipos';
import { DialogoBorrar } from './DialogoBorrar';

interface Props {
  movimiento: Movimiento;
  catalogos: Pick<Catalogos, 'cuentaPorId' | 'categoriaPorId'>;
  /** Tras borrar (volver a la lista, quitar la selección…). */
  onBorrado: () => void;
  /** Nivel del título: h2 en el panel lateral, h1 en la página de detalle. */
  nivelTitulo?: 'h1' | 'h2';
  className?: string;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-apagado">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-texto">{children}</dd>
    </div>
  );
}

/** Día en Madrid en que se registró (created_at es un instante técnico). */
export function diaDeRegistro(createdAt: string, zona: string = ZONA_POR_DEFECTO): string | null {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : fechaEnZona(d, zona);
}

export function DetalleMovimiento({ movimiento: m, catalogos, onBorrado, nivelTitulo = 'h2', className }: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const [confirmando, setConfirmando] = useState(false);
  const original = useMovimientosObtenerQuery(m.devolucion_de ?? '', { skip: m.devolucion_de === null });

  const cuenta = (id: string | null) => (id === null ? undefined : catalogos.cuentaPorId.get(id));
  const nombreCuenta = (id: string | null) => cuenta(id)?.nombre ?? t('detalle.sinDato');
  const categoria = m.categoria_id === null ? undefined : catalogos.categoriaPorId.get(m.categoria_id);
  const Titulo = nivelTitulo;

  const registrado = diaDeRegistro(m.created_at);
  const fecha = formatearFecha(m.fecha, locale, 'corta');
  const textoFecha =
    registrado !== null && registrado !== m.fecha
      ? `${fecha} · ${t('detalle.apuntado', { fecha: formatearFecha(registrado, locale, 'corta') })}`
      : fecha;

  let textoCuenta: string;
  switch (m.tipo) {
    case 'gasto':
      textoCuenta = t('detalle.saleDe', { cuenta: nombreCuenta(m.cuenta_id) });
      break;
    case 'ingreso':
    case 'devolucion':
      textoCuenta = t('detalle.entraEn', { cuenta: nombreCuenta(m.cuenta_id) });
      break;
    case 'traspaso':
      textoCuenta = t('detalle.traspaso', { origen: nombreCuenta(m.cuenta_id), destino: nombreCuenta(m.cuenta_destino_id) });
      break;
    case 'ajuste':
      textoCuenta = t('detalle.ajusteCuenta', {
        cuenta: nombreCuenta(m.cuenta_id),
        sentido: t(`sentido.${m.sentido ?? 'suma'}`).toLowerCase(),
      });
      break;
  }

  const balance =
    m.tipo === 'devolucion'
      ? t('detalle.balance.devolucion', { categoria: categoria?.nombre ?? t('meta.sinCategoria') })
      : t(`detalle.balance.${m.tipo}`);

  // proteger_cuenta_cerrada: con una cuenta cerrada la base rechaza editar y borrar.
  const cerrada = [cuenta(m.cuenta_id), cuenta(m.cuenta_destino_id)].find((c) => c?.fecha_cierre != null);
  const tipoTexto = m.tipo === 'traspaso' ? t('tipoDetalle.traspaso') : t(`tipo.${m.tipo}`);

  return (
    <article className={cx('flex flex-col gap-4', className)} aria-labelledby={`mov-${m.id}`}>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-apagado">{tipoTexto}</span>
        <Titulo id={`mov-${m.id}`} className="text-[22px] font-bold break-words text-texto">
          {m.concepto}
        </Titulo>
        <span className={cx('text-3xl font-extrabold tabular-nums', CLASE_TONO[tonoImporte(m)])}>
          {importeConSigno(m, locale)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-3.5 text-sm">
        <Dato etiqueta={t('detalle.fecha')}>{textoFecha}</Dato>
        <Dato etiqueta={t('detalle.categoria')}>{categoria?.nombre ?? t('detalle.sinDato')}</Dato>
        <Dato etiqueta={t('detalle.metodo')}>{m.metodo === null ? t('detalle.sinDato') : t(`metodo.${m.metodo}`)}</Dato>
        <Dato etiqueta={m.tipo === 'traspaso' ? t('detalle.cuentas') : t('detalle.cuenta')}>{textoCuenta}</Dato>
        <Dato etiqueta={t('detalle.origen')}>{t(`origen.${m.origen}`)}</Dato>
        {m.comercio !== null && m.comercio !== m.concepto && <Dato etiqueta={t('detalle.comercio')}>{m.comercio}</Dato>}
        <div className="col-span-2">
          <Dato etiqueta={t('detalle.balance')}>{balance}</Dato>
        </div>
      </dl>

      {m.devolucion_de !== null && (
        <div className="rounded-xl border border-borde px-3 py-2.5 text-sm">
          <p className="text-xs text-apagado">{t('detalle.devolucionDe')}</p>
          {original.data ? (
            <Link to={`/movimientos/${original.data.id}`} className="font-medium text-enlace hover:underline">
              {t('detalle.devolucionDeTexto', {
                concepto: original.data.concepto,
                importe: formatearEuros(original.data.importe, locale),
              })}
            </Link>
          ) : original.isSuccess ? (
            <p className="text-apagado">{t('detalle.devolucionDeBorrado')}</p>
          ) : null}
        </div>
      )}

      <div className="rounded-xl bg-superficie-2 px-3 py-3 text-sm text-apagado">
        <p className="sr-only">{t('detalle.notas')}</p>
        <p className="break-words whitespace-pre-line">{m.notas ?? t('detalle.sinNotas')}</p>
      </div>

      {cerrada !== undefined && (
        <p className="flex gap-2 rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2.5 text-sm text-aviso">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('detalle.cuentaCerrada', { cuenta: cerrada.nombre })}
        </p>
      )}

      <div className="flex gap-2">
        {cerrada === undefined ? (
          <Link to={`/movimientos/${m.id}/editar`} className={cx(clasesBoton('secundario'), 'flex-1')}>
            {t('detalle.editar')}
          </Link>
        ) : (
          <Button variante="secundario" disabled className="flex-1">
            {t('detalle.editar')}
          </Button>
        )}
        <Button
          variante="fantasma"
          disabled={cerrada !== undefined}
          onClick={() => setConfirmando(true)}
          className="border border-negativo/50 text-negativo hover:bg-negativo-suave"
        >
          {t('detalle.borrar')}
        </Button>
      </div>

      <DialogoBorrar
        movimiento={m}
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        onBorrado={() => {
          setConfirmando(false);
          onBorrado();
        }}
      />
    </article>
  );
}
