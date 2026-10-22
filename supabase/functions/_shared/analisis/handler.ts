// Lógica de la Edge Function analisis-mensual con dependencias inyectadas.
// index.ts (Deno) solo crea los clientes de Supabase y llama a crearHandler.
import { z } from 'zod';
import { datosAnalisisSchema } from './esquemas.ts';
import { AnalisisError, type ResultadoGenerar } from './generar.ts';
import {
  cabecerasCors,
  CuerpoDemasiadoGrande,
  leerCuerpoLimitado,
  respuestaJson,
  secretosIguales,
} from './http.ts';
import { compararMeses, esMesValido, mesActual, mesAnterior, sumarMeses, type Mes } from './mes.ts';

export type EstadoAnalisis = 'pendiente' | 'generando' | 'listo' | 'error';

export interface FilaAnalisis {
  id: string;
  user_id: string;
  mes: string;
  estado: EstadoAnalisis;
  intentos: number;
  updated_at: string;
}

export interface CamposListo {
  contenido: unknown;
  datos: unknown;
  idioma: string;
  modelo: string;
  mes_incompleto: boolean;
}

/** Acceso con service_role (salta RLS). Cada método lanza si la base devuelve error. */
export interface RepositorioServicio {
  usuariosConOnboarding(): Promise<string[]>;
  onboardingCompletado(userId: string): Promise<boolean>;
  /** Mes (día 1) de la fecha_inicial más antigua de las cuentas del usuario; null si no tiene cuentas. */
  mesInicial(userId: string): Promise<Mes | null>;
  /** Inserta filas 'pendiente' ignorando las que ya existen (unique user_id, mes). */
  crearPendientes(userIds: string[], mes: Mes): Promise<void>;
  /** pendiente, error con intentos < max, o generando atascada (updated_at < generandoAntesDe). */
  filasProcesables(limite: number, generandoAntesDe: string): Promise<FilaAnalisis[]>;
  obtenerFila(userId: string, mes: Mes): Promise<FilaAnalisis | null>;
  /**
   * Paso atómico a 'generando' (intentos + 1) condicionado al estado observado en `fila`
   * y a intentos < MAX_INTENTOS (una fila atascada no se puede reclamar sin límite).
   */
  reclamar(fila: FilaAnalisis): Promise<boolean>;
  datosAnalisis(userId: string, mes: string): Promise<unknown>;
  guardarListo(id: string, campos: CamposListo): Promise<void>;
  guardarError(id: string, codigo: string): Promise<void>;
}

/** Acceso como el usuario (clave anon + su JWT). */
export interface ClienteUsuario {
  usuarioId(): Promise<string | null>;
  /** Rehacer un análisis 'listo' (gasta la única regeneración). */
  solicitarRegeneracion(mes: Mes): Promise<'ok' | 'limite_regeneracion'>;
  /** Volver a encolar un análisis en error o atascado (no gasta la regeneración). */
  reintentarAnalisis(mes: Mes): Promise<'ok' | 'limite_reintentos' | 'en_curso'>;
}

export interface DependenciasHandler {
  servicio: RepositorioServicio;
  clienteUsuario(jwt: string): ClienteUsuario;
  generar(datos: unknown): Promise<ResultadoGenerar>;
  cronSecret: string | undefined;
  origenesPermitidos: string[];
  ahora(): Date;
  log(evento: Record<string, string | number>): void;
}

export const MAX_INTENTOS = 3;
export const MAX_CUERPO_BYTES = 1024;
/** Cuántos meses completos hacia atrás puede pedir el usuario (protege el coste de OpenAI). */
export const MESES_ATRAS_PERMITIDOS = 12;
const TAMANO_LOTE = 5;
const MAX_FILAS_POR_CRON = 50;
const PRESUPUESTO_CRON_MS = 100_000;
const GENERANDO_ATASCADA_MS = 15 * 60_000;
const LONGITUD_MINIMA_CRON_SECRET = 32;

const cuerpoUsuarioSchema = z.strictObject({
  mes: z.string().refine(esMesValido),
});

type ResultadoProceso = 'listo' | 'ocupado' | 'agotado' | 'error';

export function crearHandler(deps: DependenciasHandler): (req: Request) => Promise<Response> {
  const { servicio, log } = deps;

  const limiteAtasco = () => new Date(deps.ahora().getTime() - GENERANDO_ATASCADA_MS);

  function estaAtascada(fila: FilaAnalisis): boolean {
    return fila.estado === 'generando' && new Date(fila.updated_at) < limiteAtasco();
  }

  async function procesar(fila: FilaAnalisis): Promise<ResultadoProceso> {
    if (fila.intentos >= MAX_INTENTOS) return 'agotado';
    if (!(await servicio.reclamar(fila))) return 'ocupado';
    let codigo = 'error_interno';
    try {
      let crudo: unknown;
      try {
        crudo = await servicio.datosAnalisis(fila.user_id, fila.mes);
      } catch {
        codigo = 'datos_error';
        throw new Error(codigo);
      }
      const datos = datosAnalisisSchema.safeParse(crudo);
      if (!datos.success) {
        codigo = 'datos_invalidos';
        throw new Error(codigo);
      }
      try {
        const { contenido, modelo } = await deps.generar(datos.data);
        await servicio.guardarListo(fila.id, {
          contenido,
          datos: datos.data,
          idioma: datos.data.idioma,
          modelo,
          mes_incompleto: datos.data.mes_incompleto,
        });
      } catch (e) {
        codigo = e instanceof AnalisisError ? e.codigo : 'error_interno';
        throw e;
      }
      log({ evento: 'analisis_listo', analisis_id: fila.id });
      return 'listo';
    } catch {
      log({ evento: 'analisis_error', analisis_id: fila.id, codigo });
      try {
        await servicio.guardarError(fila.id, codigo);
      } catch {
        log({ evento: 'analisis_error_guardado', analisis_id: fila.id, codigo: 'error_interno' });
      }
      return 'error';
    }
  }

  async function modoCron(req: Request): Promise<Response> {
    const secreto = req.headers.get('x-cron-secret') ?? '';
    const esperado = deps.cronSecret ?? '';
    if (esperado.length < LONGITUD_MINIMA_CRON_SECRET) {
      log({ evento: 'cron_rechazado', codigo: 'cron_secret_no_configurado' });
      return respuestaJson(401, { error: 'no_autorizado' });
    }
    if (!(await secretosIguales(secreto, esperado))) {
      log({ evento: 'cron_rechazado', codigo: 'no_autorizado' });
      return respuestaJson(401, { error: 'no_autorizado' });
    }
    if (req.method !== 'POST') return respuestaJson(405, { error: 'metodo_no_permitido' });

    const inicio = deps.ahora().getTime();
    const mes = mesAnterior(deps.ahora());
    const usuarios = await servicio.usuariosConOnboarding();
    if (usuarios.length > 0) await servicio.crearPendientes(usuarios, mes);

    const filas = await servicio.filasProcesables(
      MAX_FILAS_POR_CRON,
      limiteAtasco().toISOString(),
    );
    let procesadas = 0;
    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      if (deps.ahora().getTime() - inicio > PRESUPUESTO_CRON_MS) break;
      for (const fila of filas.slice(i, i + TAMANO_LOTE)) {
        await procesar(fila);
        procesadas++;
      }
    }
    log({ evento: 'cron_fin', pendientes: filas.length, procesadas });
    return respuestaJson(200, { ok: true });
  }

  async function modoUsuario(req: Request, cors: Record<string, string>): Promise<Response> {
    const responder = (status: number, cuerpo: { ok: true } | { error: string }) =>
      respuestaJson(status, cuerpo, cors);

    if (req.method !== 'POST') return responder(405, { error: 'metodo_no_permitido' });

    const auth = req.headers.get('authorization') ?? '';
    const jwt = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
    if (!jwt) return responder(401, { error: 'no_autenticado' });

    let texto: string;
    try {
      texto = await leerCuerpoLimitado(req, MAX_CUERPO_BYTES);
    } catch (e) {
      if (e instanceof CuerpoDemasiadoGrande) {
        return responder(413, { error: 'cuerpo_demasiado_grande' });
      }
      return responder(400, { error: 'cuerpo_invalido' });
    }
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return responder(400, { error: 'cuerpo_invalido' });
    }
    const cuerpo = cuerpoUsuarioSchema.safeParse(json);
    if (!cuerpo.success || !esMesValido(cuerpo.data.mes)) {
      return responder(400, { error: 'cuerpo_invalido' });
    }
    const mes = cuerpo.data.mes;

    const usuario = deps.clienteUsuario(jwt);
    const userId = await usuario.usuarioId();
    if (!userId) return responder(401, { error: 'no_autenticado' });

    // Solo meses ya cerrados en Madrid y como mucho MESES_ATRAS_PERMITIDOS atrás.
    const actual = mesActual(deps.ahora());
    if (
      compararMeses(mes, actual) >= 0 ||
      compararMeses(mes, sumarMeses(actual, -MESES_ATRAS_PERMITIDOS)) < 0
    ) {
      return responder(400, { error: 'mes_no_disponible' });
    }
    if (!(await servicio.onboardingCompletado(userId))) {
      return responder(403, { error: 'onboarding_pendiente' });
    }

    // Ni meses anteriores al primero con cuentas (no hay datos que analizar).
    const inicio = await servicio.mesInicial(userId);
    if (!inicio || compararMeses(mes, inicio) < 0) {
      return responder(400, { error: 'mes_no_disponible' });
    }

    let fila = await servicio.obtenerFila(userId, mes);
    if (!fila) {
      // Primera generación de ese mes: no consume la regeneración.
      await servicio.crearPendientes([userId], mes);
      fila = await servicio.obtenerFila(userId, mes);
    } else if (fila.estado === 'listo') {
      // Rehacer un análisis bueno: gasta la única regeneración.
      if ((await usuario.solicitarRegeneracion(mes)) === 'limite_regeneracion') {
        return responder(429, { error: 'limite_regeneracion' });
      }
      fila = await servicio.obtenerFila(userId, mes);
    } else if (fila.estado === 'error' || estaAtascada(fila)) {
      // Un fallo o un atasco no es culpa del usuario: no gasta la regeneración.
      const r = await usuario.reintentarAnalisis(mes);
      if (r === 'limite_reintentos') return responder(429, { error: 'limite_reintentos' });
      if (r === 'en_curso') return responder(409, { error: 'en_curso' });
      fila = await servicio.obtenerFila(userId, mes);
    } else if (fila.estado === 'generando') {
      return responder(409, { error: 'en_curso' });
    }
    if (!fila) {
      log({ evento: 'usuario_error', codigo: 'fila_no_encontrada' });
      return responder(500, { error: 'error_interno' });
    }

    const resultado = await procesar(fila);
    if (resultado === 'agotado') return responder(429, { error: 'limite_reintentos' });
    if (resultado === 'ocupado') return responder(409, { error: 'en_curso' });
    if (resultado === 'error') return responder(502, { error: 'generacion_fallida' });
    return responder(200, { ok: true });
  }

  return async function handler(req: Request): Promise<Response> {
    let cors: Record<string, string> = {};
    try {
      if (req.headers.has('x-cron-secret')) return await modoCron(req);

      const origen = req.headers.get('origin');
      if (origen !== null) {
        if (!deps.origenesPermitidos.includes(origen)) {
          return respuestaJson(403, { error: 'origen_no_permitido' });
        }
        cors = cabecerasCors(origen);
      }
      if (req.method === 'OPTIONS') {
        if (origen === null) return respuestaJson(403, { error: 'origen_no_permitido' });
        return new Response(null, { status: 204, headers: cors });
      }
      return await modoUsuario(req, cors);
    } catch {
      log({ evento: 'error_no_controlado', codigo: 'error_interno' });
      return respuestaJson(500, { error: 'error_interno' }, cors);
    }
  };
}
