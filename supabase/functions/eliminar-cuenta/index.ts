// Edge Function eliminar-cuenta (Deno). Pegamento fino: crea el cliente de Supabase
// con service_role (solo existe dentro de la función) y delega toda la lógica en
// _shared/eliminar-cuenta/handler.ts.
import { createClient } from '@supabase/supabase-js';
import { parsearOrigenes } from '../_shared/analisis/http.ts';
import { crearHandler } from '../_shared/eliminar-cuenta/handler.ts';

const env = (nombre: string): string | undefined => Deno.env.get(nombre) || undefined;

function requerida(nombre: string): string {
  const valor = env(nombre);
  if (!valor) throw new Error(`falta_variable_${nombre}`);
  return valor;
}

const SUPABASE_URL = requerida('SUPABASE_URL');
const SERVICE_ROLE_KEY = requerida('SUPABASE_SERVICE_ROLE_KEY');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = crearHandler({
  async verificarJwt(jwt) {
    // getUser(jwt) valida el token en Supabase Auth (firma, caducidad y sesión).
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  async borrarUsuario(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error('borrar_usuario');
  },
  origenesPermitidos: parsearOrigenes(env('APP_ORIGIN')),
  ahora: () => new Date(),
  log: (evento) => console.log(JSON.stringify(evento)),
});

Deno.serve(handler);
