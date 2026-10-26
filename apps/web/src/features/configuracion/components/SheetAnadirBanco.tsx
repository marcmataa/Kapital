import { useId, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { SelectorBanco, type BancoElegido } from '@/features/onboarding/components/SelectorBanco';
import type { Cuenta } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { useHoyUsuario } from '@/shared/hooks/useHoyUsuario';
import { esEntidad, type Entidad } from '@/shared/lib/bancos';
import { IMPORTE_MAXIMO, compararImportes, parsearImporteLocal } from '@/shared/lib/dinero';
import { formatearFecha } from '@/shared/lib/fechas';
import { Button, Input, MoneyInput, Sheet, importeParaEditar } from '@/shared/ui';
import { useConfigCrearBancoMutation } from '../api/configuracionApi';
import { claveError } from '../api/errores';
import { AlertaError } from './AlertaError';
import { CLASE_BOTON, CLASE_BOTONES, CLASE_TIRADOR } from './hoja';

interface Props {
  onCerrar: () => void;
  /** Todas las cuentas (abiertas y cerradas): sus nombres y entidades ya están ocupados. */
  cuentas: readonly Cuenta[];
}

/**
 * Saldo escrito por el usuario, leído con el idioma activo → '1258.50'. Como `leer_saldo` en la
 * base: admite 0, pero no signos ni textos vacíos, y debe caber en numeric(12,2).
 */
export function leerSaldo(texto: string, locale: string): string | null {
  if (texto.includes('-')) return null;
  const saldo = parsearImporteLocal(texto, locale);
  if (saldo === null || compararImportes(saldo, IMPORTE_MAXIMO) > 0) return null;
  return saldo;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fecha de partida opcional: '' = hoy (null). Como `crear_banco`, no puede ser futura; una
 * cuenta nueva no tiene datos, así que cualquier fecha pasada respeta `validar_cuenta`.
 * 'invalida' si no es una fecha o es posterior a hoy.
 */
export function leerFechaInicial(texto: string, hoy: string): string | null | 'invalida' {
  if (texto === '') return null;
  if (!FECHA_ISO.test(texto) || texto > hoy) return 'invalida';
  return texto;
}

/**
 * Alta de un banco (`crear_banco`) con su saldo de hoy o, si se indica una fecha de partida
 * anterior, el saldo de ese día. Se monta solo mientras está abierto.
 */
export function SheetAnadirBanco({ onCerrar, cuentas }: Props) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const idForm = useId();
  const [banco, setBanco] = useState<BancoElegido | null>(null);
  const [saldo, setSaldo] = useState('');
  const [fecha, setFecha] = useState('');
  const [errorFecha, setErrorFecha] = useState<string | undefined>();
  const { hoy } = useHoyUsuario();
  const [errorBanco, setErrorBanco] = useState<string | undefined>();
  const [errorSaldo, setErrorSaldo] = useState<string | undefined>();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [crear, { isLoading }] = useConfigCrearBancoMutation();

  const excluir: Entidad[] = cuentas.map((c) => c.entidad).filter(esEntidad);
  const nombresOcupados = cuentas.map((c) => c.nombre);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorEnvio(null);
    const normalizado = leerSaldo(saldo, locale);
    setErrorBanco(banco === null ? t('anadir.elegirBanco') : undefined);
    setErrorSaldo(normalizado === null ? t('anadir.saldoInvalido') : undefined);
    const fechaInicial = leerFechaInicial(fecha, hoy);
    setErrorFecha(fechaInicial === 'invalida' ? t('anadir.fechaInvalida') : undefined);
    if (banco === null || normalizado === null || fechaInicial === 'invalida') return;
    try {
      await crear({
        entidad: banco.entidad,
        nombre: banco.nombre,
        color: banco.color,
        saldo: normalizado,
        fechaInicial,
      }).unwrap();
      toast.success(t('anadir.hecho', { nombre: banco.nombre }));
      onCerrar();
    } catch (error) {
      setErrorEnvio(
        t(
          claveError(error, {
            '23514': 'anadir.errorLimite',
            '23505': 'anadir.errorDuplicado',
            '22023': 'anadir.errorSaldo',
            '22007': 'anadir.fechaInvalida',
          }),
        ),
      );
    }
  };

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={t('anadir.titulo')}
      className={CLASE_TIRADOR}
      pie={
        <div className={CLASE_BOTONES}>
          <Button variante="secundario" className={CLASE_BOTON} onClick={onCerrar}>
            {t('accion.cancelar')}
          </Button>
          <Button type="submit" form={idForm} className={CLASE_BOTON} cargando={isLoading}>
            {t('anadir.guardar')}
          </Button>
        </div>
      }
    >
      <form id={idForm} onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <SelectorBanco
            buscador
            excluir={excluir}
            nombresOcupados={nombresOcupados}
            valor={banco}
            onCambio={(b) => {
              setBanco(b);
              setErrorBanco(undefined);
            }}
          />
          {errorBanco !== undefined && (
            <p role="alert" className="text-xs font-medium text-negativo">
              {errorBanco}
            </p>
          )}
        </div>
        <Input
          type="date"
          label={t('anadir.fecha')}
          ayuda={t('anadir.fechaAyuda')}
          opcional
          value={fecha}
          max={hoy}
          error={errorFecha}
          className="min-w-0 [&_input]:w-full [&_input]:max-w-full [&_input]:min-w-0 [&_input]:appearance-none"
          onChange={(e) => {
            setFecha(e.target.value);
            setErrorFecha(undefined);
          }}
        />
        <MoneyInput
          label={
            fecha !== '' && leerFechaInicial(fecha, hoy) !== 'invalida' && fecha !== hoy
              ? t('anadir.saldoEn', { fecha: formatearFecha(fecha, locale, 'corta') })
              : t('anadir.saldo')
          }
          ayuda={fecha === '' ? t('anadir.saldoAyuda') : t('anadir.saldoEnAyuda')}
          value={saldo}
          onChange={setSaldo}
          normalizar={leerSaldo}
          error={errorSaldo}
          placeholder={importeParaEditar('0.00', locale)}
        />
        <AlertaError mensaje={errorEnvio} />
      </form>
    </Sheet>
  );
}
