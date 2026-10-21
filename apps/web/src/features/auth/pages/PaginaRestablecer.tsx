import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinkIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/app/auth';
import { useT } from '@/shared/i18n';
import { Button, EmptyState, PantallaCarga, clasesBoton } from '@/shared/ui';
import { cambiarPassword } from '../api/authServicio';
import type { ClaveErrorAuth } from '../api/errores';
import { AlertaError } from '../components/AlertaError';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordInput } from '../components/PasswordInput';
import { PASSWORD_MINIMO, esquemaRestablecer, type DatosRestablecer } from '../schemas/esquemas';

/**
 * Destino del enlace del email de recuperación. supabase-js canjea el código de la URL por una
 * sesión y emite PASSWORD_RECOVERY (`recuperandoPassword`). El formulario SOLO aparece tras ese
 * evento: una sesión normal (p. ej. un dispositivo desbloqueado) no basta para cambiar la
 * contraseña desde aquí. Sin sesión, el enlace no vale (caducado o ya usado).
 */
export default function PaginaRestablecer() {
  const t = useT('auth');
  const { cargando, sesion, recuperandoPassword } = useAuth();
  const navigate = useNavigate();
  const esquema = useMemo(() => esquemaRestablecer(t), [t]);
  const [error, setError] = useState<ClaveErrorAuth | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosRestablecer>({ resolver: zodResolver(esquema), defaultValues: { password: '', confirmar: '' } });

  const enviar = handleSubmit(async ({ password }) => {
    setError(null);
    const r = await cambiarPassword(password);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success(t('restablecer.exito'));
    void navigate('/', { replace: true });
  });

  if (cargando) return <PantallaCarga />;

  if (!sesion) {
    return (
      <AuthLayout titulo={t('restablecer.enlaceInvalidoTitulo')}>
        <EmptyState
          icono={<LinkIcon className="size-6" />}
          titulo={t('restablecer.enlaceInvalidoTitulo')}
          descripcion={t('restablecer.enlaceInvalidoTexto')}
          accion={
            <Link to="/recuperar" className={clasesBoton('primario')}>
              {t('restablecer.pedirOtro')}
            </Link>
          }
        />
      </AuthLayout>
    );
  }

  if (!recuperandoPassword) {
    return (
      <AuthLayout titulo={t('restablecer.sinRecuperacionTitulo')}>
        <EmptyState
          icono={<LinkIcon className="size-6" />}
          titulo={t('restablecer.sinRecuperacionTitulo')}
          descripcion={t('restablecer.sinRecuperacionTexto')}
          accion={
            <Link to="/recuperar" className={clasesBoton('primario')}>
              {t('restablecer.pedirOtro')}
            </Link>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo={t('restablecer.titulo')} subtitulo={t('restablecer.subtitulo')}>
      <form noValidate onSubmit={(e) => void enviar(e)} className="flex flex-col gap-4">
        <AlertaError mensaje={error && t(error)} />
        <PasswordInput
          label={t('campo.passwordNueva')}
          autoComplete="new-password"
          ayuda={t('campo.passwordAyuda', { minimo: PASSWORD_MINIMO })}
          {...register('password')}
          error={errors.password?.message}
        />
        <PasswordInput
          label={t('campo.passwordConfirmar')}
          autoComplete="new-password"
          {...register('confirmar')}
          error={errors.confirmar?.message}
        />
        <Button type="submit" anchoCompleto cargando={isSubmitting}>
          {t('restablecer.guardar')}
        </Button>
      </form>
    </AuthLayout>
  );
}
