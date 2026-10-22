import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { Input, type InputProps } from '@/shared/ui';

/** Input de contraseña con botón de mostrar/ocultar. */
export function PasswordInput(props: Omit<InputProps, 'type' | 'sufijo'>) {
  const t = useT('auth');
  const [visible, setVisible] = useState(false);
  const etiqueta = visible ? t('campo.ocultarPassword') : t('campo.mostrarPassword');
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      sufijo={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={etiqueta}
          aria-pressed={visible}
          className="rounded-md p-1 text-apagado hover:text-texto"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      }
    />
  );
}
