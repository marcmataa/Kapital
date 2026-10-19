import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useT } from '@/shared/i18n';
import { Button, EmptyState, Input } from '@/shared/ui';
import { enviarRecuperacion } from '../api/authServicio';
import type { ClaveErrorAuth } from '../api/errores';
import { AlertaError } from '../components/AlertaError';
import { AuthLayout } from '../components/AuthLayout';
import { esquemaRecuperar, type DatosRecuperar } from '../schemas/esquemas';

export default function PaginaRecuperar() {
  const t = useT('auth');
  const esquema = useMemo(() => esquemaRecuperar(t), [t]);
  const [error, setError] = useState<ClaveErrorAuth | null>(null);
  const [enviado, setEnviado] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosRecuperar>({ resolver: zodResolver(esquema), defaultValues: { email: '' } });

  const enviar = handleSubmit(async ({ email }) => {
    setError(null);
    const r = await enviarRecuperacion(email);
    if (r.ok) setEnviado(true);
    else setError(r.error);
  });

  const pie = (
    <Link to="/login" className="font-medium text-enlace hover:underline">
      {t('recuperar.volver')}
    </Link>
  );

  if (enviado) {
    return (
      <AuthLayout titulo={t('recuperar.enviadoTitulo')} pie={pie}>
        <div role="status">
          <EmptyState
            icono={<MailCheck className="size-6" />}
            titulo={t('recuperar.enviadoTitulo')}
            descripcion={t('recuperar.enviadoTexto')}
          />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout titulo={t('recuperar.titulo')} subtitulo={t('recuperar.subtitulo')} pie={pie}>
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
        <Button type="submit" anchoCompleto cargando={isSubmitting}>
          {t('recuperar.enviar')}
        </Button>
      </form>
    </AuthLayout>
  );
}
