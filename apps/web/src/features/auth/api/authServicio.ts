import { supabase } from '@/shared/lib/supabase';
import { claveErrorAuth, type ClaveErrorAuth } from './errores';

export type Resultado = { ok: true } | { ok: false; error: ClaveErrorAuth };
export type ResultadoRegistro = { ok: true; confirmarEmail: boolean } | { ok: false; error: ClaveErrorAuth };

const origen = () => window.location.origin;

export async function iniciarSesion(email: string, password: string): Promise<Resultado> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { ok: false, error: claveErrorAuth(error, 'login') } : { ok: true };
  } catch (e) {
    return { ok: false, error: claveErrorAuth(e, 'login') };
  }
}

/** Redirige a Google; al volver, supabase-js recoge la sesión de la URL. */
export async function iniciarConGoogle(): Promise<Resultado> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origen() },
    });
    return error ? { ok: false, error: claveErrorAuth(error, 'login') } : { ok: true };
  } catch (e) {
    return { ok: false, error: claveErrorAuth(e, 'login') };
  }
}

/**
 * Alta con email. Si el email ya existe, Supabase responde igual que con uno nuevo (sin sesión),
 * así que la UI muestra siempre «revisa tu correo»: no hay enumeración de cuentas.
 */
export async function registrar(email: string, password: string): Promise<ResultadoRegistro> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: origen() },
    });
    if (error) return { ok: false, error: claveErrorAuth(error, 'registro') };
    return { ok: true, confirmarEmail: data.session === null };
  } catch (e) {
    return { ok: false, error: claveErrorAuth(e, 'registro') };
  }
}

export async function enviarRecuperacion(email: string): Promise<Resultado> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origen()}/restablecer` });
    return error ? { ok: false, error: claveErrorAuth(error, 'recuperar') } : { ok: true };
  } catch (e) {
    return { ok: false, error: claveErrorAuth(e, 'recuperar') };
  }
}

export async function cambiarPassword(password: string): Promise<Resultado> {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { ok: false, error: claveErrorAuth(error, 'restablecer') } : { ok: true };
  } catch (e) {
    return { ok: false, error: claveErrorAuth(e, 'restablecer') };
  }
}
