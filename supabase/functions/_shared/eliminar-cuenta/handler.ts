// Lógica de la Edge Function eliminar-cuenta con dependencias inyectadas.
// index.ts (Deno) solo crea el cliente de Supabase y llama a crearHandler.
//
// Contrato de seguridad:
//   · Solo POST (y OPTIONS para CORS). CORS limitado a APP_ORIGIN; un Origin que no
//     está en la lista se rechaza (403).
//   · El usuario a borrar es SIEMPRE el del JWT, verificado por Supabase Auth en el
//     servidor (getUser). Nunca se lee un id del cuerpo.
//   · Confirmación explícita: el cuerpo trae el email del usuario escrito a mano y
//     debe coincidir con el de su cuenta.
//   · Reautenticación reciente: el último inicio de sesión (claim `amr` del JWT ya
//     verificado) debe ser de hace como mucho REAUTENTICACION_MAX_MS.
//   · Se borra con la API admin solo ese usuario; las claves foráneas `on delete
//     cascade` hacia auth.users borran todos sus datos.
//   · Los logs son JSON con un evento y un código: ni ids, ni emails, ni importes.
import { z } from 'zod';
import {
  cabecerasCors,
  CuerpoDemasiadoGrande,
  leerCuerpoLimitado,
  respuestaJson,
} from '../analisis/http.ts';

/** Usuario devuelto por Supabase Auth tras verificar el JWT en el servidor. */
export interface UsuarioVerificado {
  id: string;
  email: string | null;
}

export interface DependenciasEliminar {
  /** Verifica el JWT con Supabase Auth (firma, caducidad y sesión). null si no es válido. */
  verificarJwt(jwt: string): Promise<UsuarioVerificado | null>;
  /** Borra el usuario de Auth con la API admin (service_role). Lanza si falla. */
  borrarUsuario(userId: string): Promise<void>;
  origenesPermitidos: string[];
  ahora(): Date;
  log(evento: Record<string, string | number>): void;
}

export const MAX_CUERPO_BYTES = 1024;
/** Hace cuánto puede haber sido el último inicio de sesión. */
export const REAUTENTICACION_MAX_MS = 10 * 60_000;

const cuerpoSchema = z.strictObject({
  /** El email del usuario, escrito por él como confirmación. */
  confirmacion: z.string().max(320),
});

const claimsSchema = z.object({
  sub: z.string(),
  amr: z
    .array(z.object({ method: z.string().optional(), timestamp: z.number().int().positive() }))
    .max(20)
    .optional(),
});

/** Payload de un JWT (ya verificado por Supabase Auth); null si no se puede leer. */
export function leerClaims(jwt: string): z.infer<typeof claimsSchema> | null {
  const partes = jwt.split('.');
  if (partes.length !== 3 || !partes[1]) return null;
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const binario = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const r = claimsSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Instante (ms) del inicio de sesión más reciente según `amr`; null si no hay. */
export function ultimoInicioSesion(claims: z.infer<typeof claimsSchema>): number | null {
  const marcas = (claims.amr ?? []).map((a) => a.timestamp * 1000);
  return marcas.length === 0 ? null : Math.max(...marcas);
}

const normalizarEmail = (e: string) => e.trim().toLowerCase();

export function crearHandler(deps: DependenciasEliminar): (req: Request) => Promise<Response> {
  const { log } = deps;

  async function eliminar(req: Request, cors: Record<string, string>): Promise<Response> {
    const responder = (status: number, cuerpo: { ok: true } | { error: string }) =>
      respuestaJson(status, cuerpo, cors);

    if (req.method !== 'POST') return responder(405, { error: 'metodo_no_permitido' });

    const jwt = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    if (!jwt) return responder(401, { error: 'no_autenticado' });

    let texto: string;
    try {
      texto = await leerCuerpoLimitado(req, MAX_CUERPO_BYTES);
    } catch (e) {
      if (e instanceof CuerpoDemasiadoGrande) return responder(413, { error: 'cuerpo_demasiado_grande' });
      return responder(400, { error: 'cuerpo_invalido' });
    }
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return responder(400, { error: 'cuerpo_invalido' });
    }
    const cuerpo = cuerpoSchema.safeParse(json);
    if (!cuerpo.success) return responder(400, { error: 'cuerpo_invalido' });

    // 1. ¿Quién es? Lo dice Supabase Auth, no el cliente.
    const usuario = await deps.verificarJwt(jwt);
    const claims = leerClaims(jwt);
    if (!usuario || !claims || claims.sub !== usuario.id) {
      log({ evento: 'eliminar_rechazado', codigo: 'no_autenticado' });
      return responder(401, { error: 'no_autenticado' });
    }

    // 2. Reautenticación reciente (inicio de sesión de hace ≤ 10 min).
    const inicio = ultimoInicioSesion(claims);
    const ahora = deps.ahora().getTime();
    if (inicio === null || ahora - inicio > REAUTENTICACION_MAX_MS || inicio - ahora > 60_000) {
      log({ evento: 'eliminar_rechazado', codigo: 'reautenticacion_requerida' });
      return responder(403, { error: 'reautenticacion_requerida' });
    }

    // 3. Confirmación explícita: su propio email.
    if (!usuario.email || normalizarEmail(cuerpo.data.confirmacion) !== normalizarEmail(usuario.email)) {
      log({ evento: 'eliminar_rechazado', codigo: 'confirmacion_invalida' });
      return responder(400, { error: 'confirmacion_invalida' });
    }

    // 4. Borrar SOLO a ese usuario (la cascada borra sus datos).
    try {
      await deps.borrarUsuario(usuario.id);
    } catch {
      log({ evento: 'eliminar_error', codigo: 'borrar_usuario' });
      return responder(500, { error: 'error_interno' });
    }
    log({ evento: 'cuenta_eliminada' });
    return responder(200, { ok: true });
  }

  return async function handler(req: Request): Promise<Response> {
    let cors: Record<string, string> = {};
    try {
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
      return await eliminar(req, cors);
    } catch {
      log({ evento: 'error_no_controlado', codigo: 'error_interno' });
      return respuestaJson(500, { error: 'error_interno' }, cors);
    }
  };
}
