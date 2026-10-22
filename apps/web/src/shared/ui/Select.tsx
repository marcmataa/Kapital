import type { ReactNode, Ref, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '@/shared/lib/cx';
import { Field, clasesControl } from './Field';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'size'> {
  label: ReactNode;
  error?: string | undefined;
  ayuda?: ReactNode;
  opcional?: boolean;
  id?: string | undefined;
  etiquetaOculta?: boolean;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLSelectElement>;
}

/** <select> nativo (mejor en iPhone) con el estilo de la app. Compatible con register(). */
export function Select({ label, error, ayuda, opcional, id, etiquetaOculta, className, children, ref, ...resto }: SelectProps) {
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
          <select ref={ref} className={cx(clasesControl, 'appearance-none pr-10')} {...resto} {...props}>
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-apagado"
          />
        </div>
      )}
    </Field>
  );
}
