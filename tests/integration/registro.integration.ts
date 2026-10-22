/**
 * Registro restringido con GoTrue real: solo los emails de registro_permitidos
 * pueden darse de alta, el perfil se crea solo y el email se confirma con el
 * enlace que llega a Mailpit.
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  clienteAnon, contrasenaDePrueba, emailDePrueba, entorno, limpiar, permitirRegistro, sinStack, sql,
} from './apoyo.js';

interface MensajeMailpit { ID: string }

/** Espera el email de confirmación en Mailpit y devuelve el enlace de verificación. */
async function enlaceDeConfirmacion(email: string): Promise<string> {
  const base = entorno?.mailpitUrl ?? '';
  for (let intento = 0; intento < 40; intento++) {
    const busqueda = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await busqueda.json()) as { messages: MensajeMailpit[] | null };
    const id = messages?.[0]?.ID;
    if (id) {
      const mensaje = (await (await fetch(`${base}/api/v1/message/${id}`)).json()) as { Text: string };
      const enlace = /https?:\/\/[^\s"'<>()[\]]+\/auth\/v1\/verify\?[^\s"'<>()[\]]+/.exec(mensaje.Text)?.[0];
      if (!enlace) throw new Error('El email de confirmación no trae enlace de verificación');
      return enlace;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('No llegó el email de confirmación a Mailpit');
}

afterAll(limpiar);

describe.skipIf(sinStack)('registro (GoTrue + Mailpit)', () => {
  it('el registro está cerrado por defecto', async () => {
    const [config] = await sql()<{ abierto: boolean }[]>`select abierto from registro_config`;
    expect(config?.abierto).toBe(false);
  });

  it('un email que no está en registro_permitidos no puede registrarse', async () => {
    const email = emailDePrueba();
    const { data, error } = await clienteAnon().auth.signUp({ email, password: contrasenaDePrueba() });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
    const filas = await sql()`select 1 from auth.users where email = ${email}`;
    expect(filas).toHaveLength(0);
  });

  it('un email permitido se registra, recibe el email, lo confirma y entra; el perfil nace sin onboarding', async () => {
    const email = emailDePrueba();
    const password = contrasenaDePrueba();
    await permitirRegistro(email);
    const anon = clienteAnon();

    const alta = await anon.auth.signUp({ email, password });
    expect(alta.error).toBeNull();
    const id = alta.data.user?.id;
    expect(id).toBeTruthy();
    expect(alta.data.session).toBeNull(); // confirmación de email activada

    const [perfil] = await sql()<{ onboarding_completado: boolean; zona_horaria: string; idioma: string }[]>`
      select onboarding_completado, zona_horaria, idioma from perfiles where user_id = ${id ?? ''}`;
    expect(perfil).toEqual({ onboarding_completado: false, zona_horaria: 'Europe/Madrid', idioma: 'es' });

    const antes = await anon.auth.signInWithPassword({ email, password });
    expect(antes.error?.code).toBe('email_not_confirmed');

    const enlace = await enlaceDeConfirmacion(email);
    const verificacion = await fetch(enlace, { redirect: 'manual' });
    expect([302, 303]).toContain(verificacion.status);
    expect(verificacion.headers.get('location') ?? '').toContain('access_token=');

    const despues = await anon.auth.signInWithPassword({ email, password });
    expect(despues.error).toBeNull();
    const { data, error } = await anon.from('perfiles').select('user_id, onboarding_completado');
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: id, onboarding_completado: false }]);
  });
});
