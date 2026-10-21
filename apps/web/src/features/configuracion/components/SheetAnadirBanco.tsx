import { useId, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { SelectorBanco, type BancoElegido } from '@/features/onboarding/components/SelectorBanco';
import type { Cuenta } from '@/shared/api/catalogos';
import { useIdioma, useT } from '@/shared/i18n';
import { esEntidad, type Entidad } from '@/shared/lib/bancos';
import { IMPORTE_MAXIMO, compararImportes, parsearImporteLocal } from '@/shared/lib/dinero';
import { Button, MoneyInput, Sheet, importeParaEditar } from '@/shared/ui';
import { useConfigCrearBancoMutation } from '../api/configuracionApi';
import { claveError } from '../api/errores';
import { AlertaError } from './AlertaError';

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

/** Alta de un banco con su saldo de hoy (`crear_banco`). Se monta solo mientras está abierto. */
export function SheetAnadirBanco({ onCerrar, cuentas }: Props) {
  const t = useT('configuracion');
  const { locale } = useIdioma();
  const idForm = useId();
  const [banco, setBanco] = useState<BancoElegido | null>(null);
  const [saldo, setSaldo] = useState('');
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
    if (banco === null || normalizado === null) return;
    try {
      await crear({ entidad: banco.entidad, nombre: banco.nombre, color: banco.color, saldo: normalizado }).unwrap();
      toast.success(t('anadir.hecho', { nombre: banco.nombre }));
      onCerrar();
    } catch (error) {
      setErrorEnvio(
        t(
          claveError(error, {
            '23514': 'anadir.errorLimite',
            '23505': 'anadir.errorDuplicado',
            '22023': 'anadir.errorSaldo',
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
      pie={
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={onCerrar}>
            {t('accion.cancelar')}
          </Button>
          <Button type="submit" form={idForm} cargando={isLoading}>
            {t('anadir.guardar')}
          </Button>
        </div>
      }
    >
      <form id={idForm} onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <SelectorBanco
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
        <MoneyInput
          label={t('anadir.saldo')}
          ayuda={t('anadir.saldoAyuda')}
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
