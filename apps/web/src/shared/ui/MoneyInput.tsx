import type { FocusEvent, ReactNode, Ref } from 'react';
import { useIdioma } from '@/shared/i18n';
import { parsearImporteLocal, separadorDecimal } from '@/shared/lib/dinero';
import { Input } from './Input';

export { separadorDecimal };

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
  /** Por defecto, cero en el formato del idioma: «0,00» (es/ca) o «0.00» (en). */
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  ref?: Ref<HTMLInputElement>;
  /**
   * Cómo se lee el texto al salir del campo, según el idioma activo (por defecto
   * `parsearImporteLocal`, que como el atajo convierte '-24' en 24). Si devuelve null, el texto se
   * deja tal cual para que la validación lo marque. Para saldos usa un lector estricto que rechace
   * el signo (un descubierto no es un saldo a favor).
   *
   * Normalizar al salir es solo comodidad: los formularios SIEMPRE vuelven a leer el texto con el
   * idioma al validar y al enviar (pulsar Enter no pasa por onBlur).
   */
  normalizar?: (texto: string, locale: string) => string | null;
}

/**
 * '1258.50' → '1258,50' (es) / '1258.50' (en). Sin separador de miles a propósito:
 * así el texto se vuelve a leer igual con `parsearImporteLocal` en ese idioma.
 */
export function importeParaEditar(importe: string, locale: string): string {
  return importe.replace('.', separadorDecimal(locale));
}

/**
 * Campo de importe. Teclado decimal en el iPhone, sin parseFloat: el texto se interpreta con
 * `parsearImporteLocal` según el idioma (en es/ca, réplica de leer_importe; en en, '1,000' son mil).
 * Al salir del campo se normaliza ('38,5' → '38,50'; en en, '1,000' → '1000.00').
 * Con react-hook-form, úsalo con <Controller>:
 *   <Controller name="importe" control={control} render={({ field, fieldState }) => (
 *     <MoneyInput label={t('importe')} {...field} error={fieldState.error?.message} />)} />
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  ref,
  normalizar = parsearImporteLocal,
  placeholder,
  ...resto
}: MoneyInputProps) {
  const { locale } = useIdioma();

  const alSalir = (_evento: FocusEvent<HTMLInputElement>) => {
    const normalizado = normalizar(value, locale);
    if (normalizado !== null) {
      const texto = importeParaEditar(normalizado, locale);
      if (texto !== value) onChange(texto);
    }
    onBlur?.();
  };

  return (
    <Input
      {...resto}
      placeholder={placeholder ?? importeParaEditar('0.00', locale)}
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
