// Utilidades HTTP puras (Web APIs estándar): secreto en tiempo constante,
// lectura de cuerpo con límite y CORS por lista de orígenes permitidos.

/** Compara dos secretos en tiempo constante (compara sus SHA-256, misma longitud siempre). */
export async function secretosIguales(recibido: string, esperado: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(recibido)),
    crypto.subtle.digest('SHA-256', enc.encode(esperado)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diferencia = 0;
  for (let i = 0; i < va.length; i++) diferencia |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diferencia === 0;
}

export class CuerpoDemasiadoGrande extends Error {
  constructor() {
    super('cuerpo_demasiado_grande');
    this.name = 'CuerpoDemasiadoGrande';
  }
}

/** Lee el cuerpo como texto cortando en cuanto supera `maxBytes`. */
export async function leerCuerpoLimitado(req: Request, maxBytes: number): Promise<string> {
  const declarado = req.headers.get('content-length');
  if (declarado !== null && Number(declarado) > maxBytes) throw new CuerpoDemasiadoGrande();
  if (!req.body) return '';
  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await lector.cancel().catch(() => undefined);
      throw new CuerpoDemasiadoGrande();
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) {
    todo.set(t, pos);
    pos += t.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(todo);
}

/** Parsea APP_ORIGIN ('https://a.com,https://b.com'). Nunca admite '*'. */
export function parsearOrigenes(valor: string | undefined): string[] {
  if (!valor) return [];
  return valor
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0 && o !== '*' && /^https?:\/\/[^/\s]+$/.test(o));
}

export function cabecerasCors(origen: string): Record<string, string> {
  return {
    'access-control-allow-origin': origen,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

export function respuestaJson(
  status: number,
  cuerpo: { ok: true } | { error: string },
  cabeceras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cabeceras,
    },
  });
}
