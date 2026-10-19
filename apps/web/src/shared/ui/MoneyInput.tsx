import type { FocusEvent, ReactNode, Ref } from 'react';
import { useIdioma } from '@/shared/i18n';
import { parsearImporte } from '@/shared/lib/dinero';
import { Input } from './Input';

export interface MoneyInputProps {
  label: ReactNode;
  /** Texto tal cual lo escribe el usuario ('38,5'). Se valida con `esquemaImporte` (zod). */
  value: string;
  onChange: (texto: string) => void;
  onBlur?: () => void;
  name?: string;
  error?: string | undefined;
  ayuda?: ReactNode;
  opcional?: boolean;
  id?: string | undefined;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Separador decimal del idioma (',' en es/ca, '.' en en). */
export function separadorDecimal(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? ',';
}

/**
 * '1258.50' → '1258,50' (es) / '1258.50' (en). Sin separador de miles a propósito:
 * así el texto se vuelve a leer igual con `parsearImporte` / `leer_importe`.
 */
export function importeParaEditar(importe: string, locale: string): string {
  return importe.replace('.', separadorDecimal(locale));
}

/**
 * Campo de importe. Teclado decimal en el iPhone, sin parseFloat: el texto se interpreta con
 * `parsearImporte` (réplica de leer_importe). Al salir del campo se normaliza ('38,5' → '38,50').
 * Con react-hook-form, úsalo con <Controller>:
 *   <Controller name="importe" control={control} render={({ field, fieldState }) => (
 *     <MoneyInput label={t('importe')} {...field} error={fieldState.error?.message} />)} />
 */
export function MoneyInput({ value, onChange, onBlur, ref, ...resto }: MoneyInputProps) {
  const { locale } = useIdioma();

  const alSalir = (_evento: FocusEvent<HTMLInputElement>) => {
    const normalizado = parsearImporte(value);
    if (normalizado !== null) {
      const texto = importeParaEditar(normalizado, locale);
      if (texto !== value) onChange(texto);
    }
    onBlur?.();
  };

  return (
    <Input
      {...resto}
      ref={ref ?? null}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={alSalir}
      sufijo={<span aria-hidden="true">€</span>}
    />
  );
}
