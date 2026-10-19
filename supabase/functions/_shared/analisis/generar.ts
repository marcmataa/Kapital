// Llamada a OpenAI (chat completions, salida JSON estricta) y validación con zod.
// Los errores llevan solo un código genérico: nunca el texto del proveedor.
import { contenidoSchema, esquemaRespuestaOpenAI, type ContenidoAnalisis } from './esquemas.ts';
import { construirMensajes } from './prompt.ts';

export const URL_OPENAI = 'https://api.openai.com/v1/chat/completions';
export const MODELO_POR_DEFECTO = 'gpt-4o-mini';
export const TIMEOUT_MS = 30_000;

export type CodigoErrorAnalisis = 'openai_http' | 'openai_timeout' | 'respuesta_invalida';

export class AnalisisError extends Error {
  readonly codigo: CodigoErrorAnalisis;
  constructor(codigo: CodigoErrorAnalisis) {
    super(codigo);
    this.name = 'AnalisisError';
    this.codigo = codigo;
  }
}

export interface DependenciasGenerar {
  fetch: typeof fetch;
  apiKey: string;
  modelo?: string;
  timeoutMs?: number;
}

export interface ResultadoGenerar {
  contenido: ContenidoAnalisis;
  modelo: string;
}

function esAbort(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e.name === 'AbortError' || e.name === 'TimeoutError')
  );
}

function extraerContenido(cuerpo: unknown): string {
  if (typeof cuerpo !== 'object' || cuerpo === null || !('choices' in cuerpo)) {
    throw new AnalisisError('respuesta_invalida');
  }
  const choices = cuerpo.choices;
  if (!Array.isArray(choices)) throw new AnalisisError('respuesta_invalida');
  const primera: unknown = choices[0];
  if (typeof primera !== 'object' || primera === null) throw new AnalisisError('respuesta_invalida');
  if ('finish_reason' in primera && primera.finish_reason !== 'stop') {
    throw new AnalisisError('respuesta_invalida');
  }
  const mensaje = 'message' in primera ? primera.message : undefined;
  if (typeof mensaje !== 'object' || mensaje === null) throw new AnalisisError('respuesta_invalida');
  if ('refusal' in mensaje && mensaje.refusal) throw new AnalisisError('respuesta_invalida');
  const contenido = 'content' in mensaje ? mensaje.content : undefined;
  if (typeof contenido !== 'string') throw new AnalisisError('respuesta_invalida');
  return contenido;
}

/**
 * Genera el análisis de un mes. `datos` se valida (y se limpia) dentro de
 * construirMensajes; si no cumple el contrato lanza ZodError antes de llamar a OpenAI.
 */
export async function generarAnalisis(
  datos: unknown,
  deps: DependenciasGenerar,
): Promise<ResultadoGenerar> {
  const modelo = deps.modelo ?? MODELO_POR_DEFECTO;
  const mensajes = construirMensajes(datos);
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), deps.timeoutMs ?? TIMEOUT_MS);

  try {
    let respuesta: Response;
    try {
      respuesta = await deps.fetch(URL_OPENAI, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.apiKey}`,
        },
        body: JSON.stringify({
          model: modelo,
          messages: mensajes,
          temperature: 0.2,
          max_tokens: 800,
          response_format: esquemaRespuestaOpenAI,
        }),
        signal: controlador.signal,
      });
    } catch (e) {
      throw new AnalisisError(esAbort(e) ? 'openai_timeout' : 'openai_http');
    }

    if (!respuesta.ok) {
      // No se lee el cuerpo: puede contener texto del proveedor.
      await respuesta.body?.cancel().catch(() => undefined);
      throw new AnalisisError('openai_http');
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch (e) {
      throw new AnalisisError(esAbort(e) ? 'openai_timeout' : 'respuesta_invalida');
    }

    let json: unknown;
    try {
      json = JSON.parse(extraerContenido(cuerpo));
    } catch (e) {
      if (e instanceof AnalisisError) throw e;
      throw new AnalisisError('respuesta_invalida');
    }

    const validado = contenidoSchema.safeParse(json);
    if (!validado.success) throw new AnalisisError('respuesta_invalida');
    return { contenido: validado.data, modelo };
  } finally {
    clearTimeout(temporizador);
  }
}
