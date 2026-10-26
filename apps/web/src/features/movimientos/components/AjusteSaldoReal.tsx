import { useEffect, useRef, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Scale } from 'lucide-react';
import type { Cuenta } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';
import { formatearEuros } from '@/shared/lib/dinero';
import { Button, Field, MoneyInput, Select, clasesControl, importeParaEditar } from '@/shared/ui';
import { useMovimientosCalcularAjusteQuery, useMovimientosCrearAjusteMutation } from '../api/sqlApi';
import { claveErrorAjuste, leerSaldoReal } from '../lib/ajuste';
import { NOTAS_MAXIMO, cuentaUsable } from '../schemas/movimiento';

interface Props {
  cuentas: readonly Cuenta[];
  cuentaInicial: string;
  onGuardado: () => void;
  onCancelar: () => void;
}

const ESPERA_CALCULO_MS = 350;

/** Cuentas que se cuadran con un ajuste: abiertas y que no son de inversión (esas usan valoraciones). */
export function cuentaAjustable(c: Cuenta | undefined): c is Cuenta {
  return cuentaUsable(c) && c.tipo !== 'inversion';
}

/**
 * Ajuste por saldo real (sección 9: «Ajuste por la diferencia, con nota»): el usuario escribe
 * cuánto tiene AHORA en la cuenta y la base calcula la diferencia con el saldo de la app
 * (`calcular_ajuste`) y crea el ajuste (`crear_ajuste`). La web no resta importes: solo muestra
 * lo que devuelve SQL antes de guardar. Si la diferencia es 0, no hay nada que guardar.
 */
export function AjusteSaldoReal({ cuentas, cuentaInicial, onGuardado, onCancelar }: Props) {
  const t = useT('movimientos');
  const { locale } = useIdioma();
  const ajustables = cuentas.filter(cuentaAjustable);
  const [cuentaId, setCuentaId] = useState(
    ajustables.some((c) => c.id === cuentaInicial) ? cuentaInicial : (ajustables[0]?.id ?? ''),
  );
  const [texto, setTexto] = useState('');
  const [nota, setNota] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [crear, { isLoading }] = useMovimientosCrearAjusteMutation();
  const refSaldo = useRef<HTMLInputElement>(null);
  // El saldo real recibe el foco al abrir (teclado decimal directamente en el móvil).
  useEffect(() => {
    refSaldo.current?.focus();
  }, []);

  const saldo = leerSaldoReal(texto, locale);
  // El cálculo se pide tras una pausa al escribir (no una consulta por tecla).
  const [saldoPedido, setSaldoPedido] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setSaldoPedido(saldo), ESPERA_CALCULO_MS);
    return () => window.clearTimeout(id);
  }, [saldo]);

  const calculo = useMovimientosCalcularAjusteQuery(
    { cuenta: cuentaId, saldoReal: saldoPedido ?? '' },
    { skip: saldoPedido === null || saldoPedido !== saldo || cuentaId === '' },
  );
  const cuenta = ajustables.find((c) => c.id === cuentaId);
  const resultado = saldo !== null && saldoPedido === saldo ? calculo.data : undefined;
  const cuadra = resultado?.diferencia === '0.00';

  const errorSaldo =
    texto.trim() !== '' && saldo === null
      ? t('ajuste.saldoInvalido')
      : enviado && saldo === null
        ? t('ajuste.saldoObligatorio')
        : undefined;
  const errorNota = enviado && nota.trim() === '' ? t('validacion.notaAjuste') : undefined;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviado(true);
    setErrorEnvio(null);
    if (saldo === null || nota.trim() === '' || cuenta === undefined || cuadra) return;
    try {
      const r = await crear({ cuenta: cuenta.id, saldoReal: saldo, nota: nota.trim(), concepto: t('ajuste.concepto') }).unwrap();
      toast.success(r.id === null ? t('ajuste.cuadra') : t('ajuste.creado'));
      onGuardado();
    } catch (err) {
      setErrorEnvio(t(claveErrorAjuste(err)));
    }
  };

  let vistaPrevia;
  if (saldo === null) {
    vistaPrevia = null;
  } else if (resultado === undefined) {
    vistaPrevia = (
      <p className="text-sm text-apagado" aria-busy="true">
        {calculo.isError ? t(claveErrorAjuste(calculo.error)) : t('ajuste.calculando')}
      </p>
    );
  } else if (cuadra) {
    vistaPrevia = <p className="text-sm font-medium text-positivo">{t('ajuste.cuadra')}</p>;
  } else if (resultado !== null) {
    const importe = formatearEuros(resultado.diferencia, locale, {
      signo: resultado.sentido === 'resta' ? 'negativo' : 'siempre',
    });
    vistaPrevia = (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-texto">{t('ajuste.seCrearaAjuste', { importe })}</p>
        <p className="text-xs text-apagado">
          {t('ajuste.detalle', {
            app: formatearEuros(resultado.saldo_app, locale),
            real: formatearEuros(resultado.saldo_real, locale),
          })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-4">
      <p
        role="note"
        className="flex gap-2 rounded-xl border border-aviso-borde bg-aviso-suave px-3 py-2.5 text-sm text-aviso"
      >
        <Scale aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t('form.avisoAjuste')}
      </p>

      <Select label={t('form.cuentaAjuste')} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
        {ajustables.map((c) => (
          <option key={c.id} value={c.id}>
            {c.valor === null ? c.nombre : `${c.nombre} · ${formatearEuros(c.valor, locale)}`}
          </option>
        ))}
      </Select>

      <MoneyInput
        label={t('ajuste.pregunta', { cuenta: cuenta?.nombre ?? '' })}
        ayuda={t('ajuste.preguntaAyuda')}
        value={texto}
        onChange={(v) => {
          setTexto(v);
          setErrorEnvio(null);
        }}
        normalizar={leerSaldoReal}
        error={errorSaldo}
        placeholder={importeParaEditar('0.00', locale)}
        ref={refSaldo}
        className="[&_input]:h-14 [&_input]:text-2xl [&_input]:font-semibold"
      />

      <div aria-live="polite" className={cx('rounded-xl bg-superficie-2 px-3 py-2.5', vistaPrevia === null && 'hidden')}>
        {vistaPrevia}
      </div>

      <Field label={t('form.notaAjuste')} ayuda={t('form.notaAjusteAyuda')} error={errorNota}>
        {(props) => (
          <textarea
            rows={3}
            maxLength={NOTAS_MAXIMO}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className={cx(clasesControl, 'h-auto min-h-20 py-2.5')}
            {...props}
          />
        )}
      </Field>

      {errorEnvio !== null && (
        <p role="alert" className="rounded-xl bg-negativo-suave px-3 py-2.5 text-sm font-medium text-negativo">
          {errorEnvio}
        </p>
      )}

      <PieFormulario
        cancelar={t('form.cancelar')}
        guardar={t('form.guardar')}
        cargando={isLoading}
        deshabilitado={cuadra}
        onCancelar={onCancelar}
      />
    </form>
  );
}

interface PropsPie {
  cancelar: string;
  guardar: string;
  cargando: boolean;
  deshabilitado?: boolean;
  onCancelar: () => void;
}

/**
 * Botones del formulario. En móvil, Guardar ocupa todo el ancho y queda fijo abajo (Cancelar es
 * la flecha de volver de la cabecera); en escritorio, Cancelar y Guardar en línea.
 */
export function PieFormulario({ cancelar, guardar, cargando, deshabilitado = false, onCancelar }: PropsPie) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-1 flex gap-2 border-t border-borde bg-fondo px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:pt-1">
      <Button variante="secundario" onClick={onCancelar} className="max-lg:hidden">
        {cancelar}
      </Button>
      <Button type="submit" tamano="lg" cargando={cargando} disabled={deshabilitado} className="flex-1">
        {guardar}
      </Button>
    </div>
  );
}
