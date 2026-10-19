import { z } from 'zod';
import type { FuncionT } from '@/shared/i18n';

export const PASSWORD_MINIMO = 12;
/** Límite de bcrypt en Supabase Auth. */
export const PASSWORD_MAXIMO = 72;

type T = FuncionT<'auth'>;

const email = (t: T) => z.string().trim().toLowerCase().pipe(z.email({ message: t('validacion.emailInvalido') }));

const passwordNueva = (t: T) =>
  z
    .string()
    .min(PASSWORD_MINIMO, { message: t('validacion.passwordCorta', { minimo: PASSWORD_MINIMO }) })
    .max(PASSWORD_MAXIMO, { message: t('validacion.passwordLarga', { maximo: PASSWORD_MAXIMO }) });

export const esquemaLogin = (t: T) =>
  z.object({
    email: email(t),
    password: z.string().min(1, { message: t('validacion.passwordObligatoria') }),
  });

export const esquemaRecuperar = (t: T) => z.object({ email: email(t) });

const coinciden = (t: T) => ({ message: t('validacion.passwordsDistintas'), path: ['confirmar'] });

export const esquemaRegistro = (t: T) =>
  z
    .object({ email: email(t), password: passwordNueva(t), confirmar: z.string() })
    .refine((v) => v.password === v.confirmar, coinciden(t));

export const esquemaRestablecer = (t: T) =>
  z
    .object({ password: passwordNueva(t), confirmar: z.string() })
    .refine((v) => v.password === v.confirmar, coinciden(t));

export type DatosLogin = z.infer<ReturnType<typeof esquemaLogin>>;
export type DatosRecuperar = z.infer<ReturnType<typeof esquemaRecuperar>>;
export type DatosRegistro = z.infer<ReturnType<typeof esquemaRegistro>>;
export type DatosRestablecer = z.infer<ReturnType<typeof esquemaRestablecer>>;
