/**
 * Utilidades comunes de los tests de integración contra el stack local.
 * Emails únicos por ejecución (test+<run>-<uuid>@kapital.test), sin datos
 * personales. Todo lo creado se borra en `limpiar()`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';
import type { EntornoLocal } from './global-setup.js';

export const entorno: EntornoLocal | null = inject('kapitalLocal');
export const sinStack = entorno === null;

const RUN = randomUUID().slice(0, 8);

function env(): EntornoLocal {
  if (!entorno) throw new Error('Stack local no disponible');
  return entorno;
}

const opcionesCliente = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Cliente con la clave anon y sin sesión (como el atajo o un visitante). */
export function clienteAnon(): SupabaseClient {
  return createClient(env().apiUrl, env().anonKey, opcionesCliente);
}

/** Cliente service_role: solo para preparar y limpiar. */
export function clienteAdmin(): SupabaseClient {
  return createClient(env().apiUrl, env().serviceRoleKey, opcionesCliente);
}

let conexion: postgres.Sql | null = null;
/** Conexión directa como `postgres` (dueño de las tablas: salta RLS). */
export function sql(): postgres.Sql {
  conexion ??= postgres(env().dbUrl, { max: 2, onnotice: () => undefined });
  return conexion;
}

export function emailDePrueba(): string {
  return `test+${RUN}-${randomUUID().slice(0, 12)}@kapital.test`;
}

/** Contraseña que cumple la política local (≥ 12, mayúsculas, minúsculas y dígitos). */
export function contrasenaDePrueba(): string {
  return `Prueba${randomUUID().replaceAll('-', '').slice(0, 12)}Aa1`;
}

const emailsCreados = new Set<string>();

/** Añade el email a la lista de registro permitido (como se hace desde el SQL Editor). */
export async function permitirRegistro(email: string): Promise<void> {
  emailsCreados.add(email);
  await sql()`insert into registro_permitidos (email) values (${email}) on conflict do nothing`;
}

export interface Usuario {
  id: string;
  email: string;
  cliente: SupabaseClient;
}

/**
 * Usuario permitido, ya confirmado y con sesión. Se crea con la API admin para
 * no gastar el límite de emails de GoTrue (el flujo con email real se prueba en
 * registro.integration.ts).
 */
export async function crearUsuario(): Promise<Usuario> {
  const email = emailDePrueba();
  const password = contrasenaDePrueba();
  await permitirRegistro(email);
  const { data, error } = await clienteAdmin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear el usuario de prueba: ${error?.message ?? 'sin datos'}`);
  const cliente = clienteAnon();
  const sesion = await cliente.auth.signInWithPassword({ email, password });
  if (sesion.error) throw new Error(`No se pudo iniciar sesión: ${sesion.error.message}`);
  return { id: data.user.id, email, cliente };
}

/** Onboarding mínimo: un banco principal (BBVA), efectivo y las categorías por defecto. */
export async function completarOnboarding(u: Usuario): Promise<void> {
  const { error } = await u.cliente.rpc('completar_onboarding', {
    p_idioma: 'es',
    p_bancos: [{ entidad: 'bbva', saldo: '1.000,00' }],
    p_efectivo: '50',
  });
  if (error) throw new Error(`completar_onboarding: ${error.message}`);
}

/** Id de una fila; falla si la consulta no devuelve exactamente una. */
export async function idDe(u: Usuario, tabla: 'cuentas' | 'categorias', nombre: string): Promise<string> {
  const { data, error } = await u.cliente.from(tabla).select('id').eq('nombre', nombre).single<{ id: string }>();
  if (error) throw new Error(`${tabla} ${nombre}: ${error.message}`);
  return data.id;
}

/** Borra los usuarios de esta ejecución (en cascada: perfiles, cuentas, movimientos…) y su permiso de registro. */
export async function limpiar(): Promise<void> {
  if (!entorno) return;
  const emails = [...emailsCreados];
  if (emails.length > 0) {
    await sql()`delete from auth.users where email in ${sql()(emails)}`;
    await sql()`delete from registro_permitidos where email in ${sql()(emails)}`;
  }
  emailsCreados.clear();
  await conexion?.end({ timeout: 5 });
  conexion = null;
}
