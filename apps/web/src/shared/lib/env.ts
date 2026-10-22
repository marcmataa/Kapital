/**
 * Configuración pública de la web. Solo se comprueba que existe: los valores no se
 * imprimen ni se registran nunca.
 */
export interface ConfigSupabase {
  url: string;
  anonKey: string;
}

export type ResultadoConfig = { ok: true; config: ConfigSupabase } | { ok: false; faltan: string[] };

export function leerConfig(env: Partial<Record<string, string | undefined>> = import.meta.env): ResultadoConfig {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const faltan: string[] = [];
  if (!url) faltan.push('VITE_SUPABASE_URL');
  if (!anonKey) faltan.push('VITE_SUPABASE_ANON_KEY');
  if (faltan.length > 0) return { ok: false, faltan };
  return { ok: true, config: { url, anonKey } };
}

export const configApp = leerConfig();
