import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { Button, EmptyState, Input } from '@/shared/ui';
import { registrar } from '../api/authServicio';
import type { ClaveErrorAuth } from '../api/errores';
import { AlertaError } from '../components/AlertaError';
import { AuthLayout, SeparadorO } from '../components/AuthLayout';
import { BotonGoogle } from '../components/BotonGoogle';
import { PasswordInput } from '../components/PasswordInput';
import { PASSWORD_MINIMO, esquemaRegistro, type DatosRegistro } from '../schemas/esquemas';

export default function PaginaRegistro() {
  const t = useT('auth');
  const esquema = useMemo(() => esquemaRegistro(t), [t]);
  const [error, setError] = useState<ClaveErrorAuth | null>(null);
  const [enviado, setEnviado] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosRegistro>({
    resolver: zodResolver(esquema),
    defaultValues: { email: '', password: '', confirmar: '' },
  });

  const enviar = handleSubmit(async ({ email, password }) => {
    setError(null);
    const r = await registrar(email, password);
    if (!r.ok) setError(r.error);
    else if (r.confirmarEmail) setEnviado(true);
    // Sin confirmación por email hay sesión y <PublicOnly> redirige.
  });

  const pie = (
    <>
      {t('registro.conCuenta')}{' '}
      <Link to="/login" className="font-medium text-enlace hover:underline">
        {t('registro.irLogin')}
      </Link>
    </>
  );

  if (enviado) {
    return (
      <AuthLayout titulo={t('registro.enviadoTitulo')} pie={pie}>
        <div role="status">
          <EmptyState
            icono={<MailCheck className="size-6" />}
            titulo={t('registro.enviadoTitulo')}
            descripcion={t('registro.enviadoTexto')}
          />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo={t('registro.titulo')} subtitulo={t('registro.subtitulo')} pie={pie}>
      <div className="flex flex-col gap-4">
        <BotonGoogle onError={setError} />
        <SeparadorO texto={t('login.separador')} />
        <form noValidate onSubmit={(e) => void enviar(e)} className="flex flex-col gap-4">
          <AlertaError mensaje={error && t(error)} />
          <Input
            label={t('campo.email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <PasswordInput
            label={t('campo.password')}
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
            {t('registro.crear')}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
