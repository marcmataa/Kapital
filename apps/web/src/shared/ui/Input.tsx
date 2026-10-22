import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '@/shared/lib/cx';
import { Field, clasesControl } from './Field';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'size'> {
  label: ReactNode;
  error?: string | undefined;
  ayuda?: ReactNode;
  opcional?: boolean;
  id?: string | undefined;
  etiquetaOculta?: boolean;
  /** Contenido a la derecha dentro del campo (símbolo €, botón de mostrar contraseña…). */
  sufijo?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Input accesible compatible con react-hook-form:
 *   <Input label={t('campo.email')} type="email" {...register('email')} error={errors.email?.message} />
 */
export function Input({
  label,
  error,
  ayuda,
  opcional,
  id,
  etiquetaOculta,
  sufijo,
  className,
  ref,
  ...resto
}: InputProps) {
  return (
    <Field
      label={label}
      error={error}
      ayuda={ayuda}
      opcional={opcional ?? false}
      id={id}
      etiquetaOculta={etiquetaOculta ?? false}
      className={className ?? ''}
    >
      {(props) => (
        <div className="relative">
          <input ref={ref} className={cx(clasesControl, sufijo !== undefined && 'pr-11')} {...resto} {...props} />
          {sufijo !== undefined && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-apagado">{sufijo}</div>
          )}
        </div>
      )}
    </Field>
  );
}
