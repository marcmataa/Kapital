import { createClient } from '@supabase/supabase-js';
import type { Database } from '@db/database.types';
import { configApp } from './env';

// Si falta la configuración, main.tsx muestra una pantalla de error y nunca se usa este
// cliente; se crea con un origen inválido para no romper los imports.
const url = configApp.ok ? configApp.config.url : 'https://configuracion-ausente.invalid';
const anonKey = configApp.ok ? configApp.config.anonKey : 'configuracion-ausente';

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export type ClienteSupabase = typeof supabase;
