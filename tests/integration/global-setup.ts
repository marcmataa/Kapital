/**
 * Lee las URLs y claves del stack LOCAL de Supabase con `supabase status -o env`
 * y se las pasa a los tests con `provide` (nunca por stdout ni a ficheros).
 * Si el stack no está arrancado o no responde, los tests se saltan solos.
 */
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { TestProject } from 'vitest/node';

export interface EntornoLocal {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
  mailpitUrl: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    /** null si el stack local no está disponible. */
    kapitalLocal: EntornoLocal | null;
  }
}

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const VERSION_CLI = 'supabase@2.121.0';

/** Interpreta líneas KEY="valor" sin mostrarlas nunca. */
function leerEnv(salida: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const linea of salida.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(?:"(.*)"|(.*))$/.exec(linea.trim());
    if (m?.[1]) vars.set(m[1], m[2] ?? m[3] ?? '');
  }
  return vars;
}

/** Solo se aceptan URLs locales: estos tests nunca tocan un proyecto remoto. */
function esLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

async function leerEntorno(): Promise<EntornoLocal | null> {
  let salida: string;
  try {
    // Comando fijo (sin entrada externa); exec usa la shell, así Windows encuentra npx.cmd.
    ({ stdout: salida } = await promisify(exec)(`npx --yes ${VERSION_CLI} status -o env`, {
      cwd: raiz,
      timeout: 90_000,
      windowsHide: true,
    }));
  } catch {
    return null;
  }
  const v = leerEnv(salida);
  const apiUrl = v.get('API_URL');
  const anonKey = v.get('ANON_KEY') ?? v.get('PUBLISHABLE_KEY');
  const serviceRoleKey = v.get('SERVICE_ROLE_KEY') ?? v.get('SECRET_KEY');
  const dbUrl = v.get('DB_URL');
  const mailpitUrl = v.get('MAILPIT_URL') ?? v.get('INBUCKET_URL') ?? 'http://127.0.0.1:54324';
  if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl) return null;
  if (![apiUrl, dbUrl.replace(/^postgres(ql)?:/, 'http:'), mailpitUrl].every(esLocal)) return null;

  try {
    const r = await fetch(`${apiUrl}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
  } catch {
    return null;
  }
  return { apiUrl, anonKey, serviceRoleKey, dbUrl, mailpitUrl };
}

export default async function setup(project: TestProject): Promise<void> {
  const entorno = await leerEntorno();
  if (!entorno) {
    console.warn('[integración] Stack local de Supabase no disponible: se saltan los tests (npx supabase start).');
  }
  project.provide('kapitalLocal', entorno);
}
