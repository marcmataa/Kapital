// Edge Function analisis-mensual (Deno). Pegamento fino: crea los clientes de
// Supabase y delega toda la lógica en _shared/analisis/handler.ts.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generarAnalisis } from '../_shared/analisis/generar.ts';
import {
  crearHandler,
  MAX_INTENTOS,
  type ClienteUsuario,
  type FilaAnalisis,
  type RepositorioServicio,
} from '../_shared/analisis/handler.ts';
import { parsearOrigenes } from '../_shared/analisis/http.ts';

const env = (nombre: string): string | undefined => Deno.env.get(nombre) || undefined;

function requerida(nombre: string): string {
  const valor = env(nombre);
  if (!valor) throw new Error(`falta_variable_${nombre}`);
  return valor;
}

const SUPABASE_URL = requerida('SUPABASE_URL');
const SERVICE_ROLE_KEY = requerida('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = requerida('SUPABASE_ANON_KEY');
const OPENAI_API_KEY = requerida('OPENAI_API_KEY');

const opcionesAuth = { auth: { persistSession: false, autoRefreshToken: false } } as const;

const COLUMNAS_FILA = 'id, user_id, mes, estado, intentos, updated_at';

const filaSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  mes: z.string(),
  estado: z.enum(['pendiente', 'generando', 'listo', 'error']),
  intentos: z.number().int(),
  updated_at: z.string(),
});

function comprobar<T>(r: { data: T; error: unknown }, codigo: string): T {
  if (r.error) throw new Error(codigo);
  return r.data;
}

function repositorioServicio(db: SupabaseClient): RepositorioServicio {
  const tabla = () => db.from('analisis_mensuales');
  return {
    async usuariosConOnboarding() {
      const filas = comprobar(
        await db.from('perfiles').select('user_id').eq('onboarding_completado', true),
        'perfiles',
      );
      return z.array(z.object({ user_id: z.string() })).parse(filas).map((f) => f.user_id);
    },
    async onboardingCompletado(userId) {
      const fila = comprobar(
        await db
          .from('perfiles')
          .select('onboarding_completado')
          .eq('user_id', userId)
          .maybeSingle(),
        'perfiles',
      );
      return z.object({ onboarding_completado: z.boolean() }).nullable().parse(fila)
        ?.onboarding_completado === true;
    },
    async crearPendientes(userIds, mes) {
      comprobar(
        await tabla().upsert(
          userIds.map((user_id) => ({ user_id, mes, estado: 'pendiente' })),
          { onConflict: 'user_id,mes', ignoreDuplicates: true },
        ),
        'crear_pendientes',
      );
    },
    async filasProcesables(limite, generandoAntesDe) {
      const filas = comprobar(
        await tabla()
          .select(COLUMNAS_FILA)
          .or(
            [
              'estado.eq.pendiente',
              `and(estado.eq.error,intentos.lt.${MAX_INTENTOS})`,
              `and(estado.eq.generando,intentos.lt.${MAX_INTENTOS},updated_at.lt."${generandoAntesDe}")`,
            ].join(','),
          )
          .order('created_at', { ascending: true })
          .limit(limite),
        'filas_procesables',
      );
      return z.array(filaSchema).parse(filas);
    },
    async obtenerFila(userId, mes) {
      const fila = comprobar(
        await tabla().select(COLUMNAS_FILA).eq('user_id', userId).eq('mes', mes).maybeSingle(),
        'obtener_fila',
      );
      return filaSchema.nullable().parse(fila);
    },
    async reclamar(fila: FilaAnalisis) {
      if (fila.estado === 'listo') return false;
      // Actualización condicionada al estado observado: si otra ejecución la tomó, no casa.
      const filas = comprobar(
        await tabla()
          .update({
            estado: 'generando',
            intentos: fila.intentos + 1,
            error_codigo: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', fila.id)
          .eq('estado', fila.estado)
          .eq('intentos', fila.intentos)
          .eq('updated_at', fila.updated_at)
          .select('id'),
        'reclamar',
      );
      return Array.isArray(filas) && filas.length === 1;
    },
    async datosAnalisis(userId, mes) {
      return comprobar(
        await db.rpc('datos_analisis_usuario', { p_user: userId, p_mes: mes }),
        'datos_analisis_usuario',
      );
    },
    async guardarListo(id, campos) {
      comprobar(
        await tabla()
          .update({
            ...campos,
            estado: 'listo',
            error_codigo: null,
            generado_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id),
        'guardar_listo',
      );
    },
    async guardarError(id, codigo) {
      comprobar(
        await tabla()
          .update({ estado: 'error', error_codigo: codigo, updated_at: new Date().toISOString() })
          .eq('id', id),
        'guardar_error',
      );
    },
  };
}

function clienteUsuario(jwt: string): ClienteUsuario {
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    ...opcionesAuth,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  return {
    async usuarioId() {
      const { data, error } = await db.auth.getUser(jwt);
      if (error) return null;
      return data.user?.id ?? null;
    },
    async solicitarRegeneracion(mes) {
      const { error } = await db.rpc('solicitar_regeneracion', { p_mes: mes });
      if (!error) return 'ok';
      if (error.message === 'limite_regeneracion') return 'limite_regeneracion';
      throw new Error('solicitar_regeneracion');
    },
  };
}

const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, opcionesAuth);

const handler = crearHandler({
  servicio: repositorioServicio(servicio),
  clienteUsuario,
  generar: (datos) => generarAnalisis(datos, { fetch, apiKey: OPENAI_API_KEY }),
  cronSecret: env('CRON_SECRET'),
  origenesPermitidos: parsearOrigenes(env('APP_ORIGIN')),
  ahora: () => new Date(),
  log: (evento) => console.log(JSON.stringify(evento)),
});

Deno.serve(handler);
