import { useId, type ReactNode } from 'react';
import { useT } from '@/shared/i18n';
import { cx } from '@/shared/lib/cx';

/** Props de accesibilidad que Field pasa al control que envuelve. */
export interface PropsControl {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  label: ReactNode;
  /** Mensaje de error ya traducido (p. ej. `errors.importe?.message`). */
  error?: string | undefined;
  ayuda?: ReactNode;
  opcional?: boolean;
  /** id del control; si no se da, se genera. */
  id?: string | undefined;
  className?: string;
  /** Oculta la etiqueta visualmente (sigue disponible para lectores de pantalla). */
  etiquetaOculta?: boolean;
  children: (props: PropsControl) => ReactNode;
}

/**
 * Etiqueta + control + ayuda + error, enlazados con id / aria-describedby / aria-invalid.
 * Úsalo para controles propios; para inputs normales usa <Input>, <Select> o <MoneyInput>.
 */
export function Field({ label, error, ayuda, opcional = false, id, className, etiquetaOculta = false, children }: FieldProps) {
  const t = useT('common');
  const generado = useId();
  const idControl = id ?? generado;
  const idAyuda = `${idControl}-ayuda`;
  const idError = `${idControl}-error`;
  const describe = [ayuda !== undefined ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');

  const props: PropsControl = { id: idControl };
  if (describe) props['aria-describedby'] = describe;
  if (error) props['aria-invalid'] = true;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={idControl} className={cx('text-sm font-medium text-texto', etiquetaOculta && 'sr-only')}>
        {label}
        {opcional && <span className="ml-1 font-normal text-apagado">({t('campo.opcional')})</span>}
      </label>
      {children(props)}
      {ayuda !== undefined && !error && (
        <p id={idAyuda} className="text-xs text-apagado">
          {ayuda}
        </p>
      )}
      {ayuda !== undefined && error && (
        <p id={idAyuda} className="sr-only">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-xs font-medium text-negativo">
          {error}
        </p>
      )}
    </div>
  );
}

/** Clases comunes de inputs y selects. */
export const clasesControl = cx(
  'h-11 w-full rounded-xl border border-borde-input bg-superficie-2 px-3 text-base text-texto sm:text-sm',
  'placeholder:text-tenue transition-colors',
  'focus:border-acento focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-acento/45',
  'aria-[invalid=true]:border-negativo',
  'disabled:cursor-not-allowed disabled:opacity-60',
);
