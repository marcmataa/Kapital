import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { useT } from '@/shared/i18n';
import { Button, Input } from '@/shared/ui';
import { iniciarSesion } from '../api/authServicio';
import { descartarErrorOAuth, errorOAuthPendiente } from '../api/errorOAuth';
import type { ClaveErrorAuth } from '../api/errores';
import { AlertaError } from '../components/AlertaError';
import { AuthLayout, SeparadorO } from '../components/AuthLayout';
import { BotonGoogle } from '../components/BotonGoogle';
import { PasswordInput } from '../components/PasswordInput';
import { esquemaLogin, type DatosLogin } from '../schemas/esquemas';

export default function PaginaLogin() {
  const t = useT('auth');
  const esquema = useMemo(() => esquemaLogin(t), [t]);
  // Si se vuelve de Google con error, main.tsx lo ha capturado antes de redirigir aquí.
  const [error, setError] = useState<ClaveErrorAuth | null>(errorOAuthPendiente);
  useEffect(() => descartarErrorOAuth(), []);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosLogin>({ resolver: zodResolver(esquema), defaultValues: { email: '', password: '' } });

  // Si va bien, <PublicOnly> detecta la sesión y redirige.
  const enviar = handleSubmit(async ({ email, password }) => {
    setError(null);
    const r = await iniciarSesion(email, password);
    if (!r.ok) setError(r.error);
  });

  return (
    <AuthLayout
      titulo={t('login.titulo')}
      subtitulo={t('login.subtitulo')}
      pie={
        <>
          {t('login.sinCuenta')}{' '}
          <Link to="/registro" className="font-medium text-enlace hover:underline">
            {t('login.irRegistro')}
          </Link>
        </>
      }
    >
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
            autoComplete="current-password"
            {...register('password')}
            error={errors.password?.message}
          />
          <div className="-mt-1 text-right">
            <Link to="/recuperar" className="text-sm text-enlace hover:underline">
              {t('login.olvidada')}
            </Link>
          </div>
          <Button type="submit" anchoCompleto cargando={isSubmitting}>
            {t('login.entrar')}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
