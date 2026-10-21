/*
 * Errores de la Edge Function `analisis-mensual`. El cliente solo ve códigos genéricos
 * ({ error: '<código>' }); nunca se muestra el texto del proveedor ni de la base.
 */

export const CODIGOS_FUNCION = [
  'limite_regeneracion',
  'limite_reintentos',
  'en_curso',
  'generacion_fallida',
  'mes_no_disponible',
  'onboarding_pendiente',
  'cuerpo_invalido',
  'cuerpo_demasiado_grande',
  'no_autenticado',
  'error_interno',
] as const;
export type CodigoFuncion = (typeof CODIGOS_FUNCION)[number] | 'red' | 'desconocido';

const POR_ESTADO: Readonly<Record<number, CodigoFuncion>> = {
  400: 'cuerpo_invalido',
  401: 'no_autenticado',
  403: 'onboarding_pendiente',
  409: 'en_curso',
  413: 'cuerpo_demasiado_grande',
  429: 'limite_regeneracion',
  502: 'generacion_fallida',
};

function esCodigo(valor: unknown): valor is (typeof CODIGOS_FUNCION)[number] {
  return typeof valor === 'string' && (CODIGOS_FUNCION as readonly string[]).includes(valor);
}

interface RespuestaHttp {
  status: number;
  clone?: () => RespuestaHttp;
  json: () => Promise<unknown>;
}

function esRespuesta(valor: unknown): valor is RespuestaHttp {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as { status?: unknown }).status === 'number' &&
    typeof (valor as { json?: unknown }).json === 'function'
  );
}

/** Error de `supabase.functions.invoke` → código propio (lee el cuerpo `{ error }` si existe). */
export async function codigoErrorFuncion(error: unknown): Promise<CodigoFuncion> {
  if (error instanceof TypeError) return 'red';
  if (typeof error !== 'object' || error === null) return 'desconocido';
  const e = error as { name?: unknown; context?: unknown };
  if (e.name === 'FunctionsFetchError') return 'red';
  if (esRespuesta(e.context)) {
    const respuesta = e.context;
    try {
      const cuerpo = await (respuesta.clone ? respuesta.clone() : respuesta).json();
      const codigo = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { error?: unknown }).error : undefined;
      if (esCodigo(codigo)) return codigo;
    } catch {
      // Cuerpo ilegible: se decide por el código HTTP.
    }
    return POR_ESTADO[respuesta.status] ?? 'desconocido';
  }
  return 'desconocido';
}

export type ClaveErrorAnalisis =
  | 'error.limite'
  | 'error.limiteReintentos'
  | 'error.enCurso'
  | 'error.generacion'
  | 'error.mesNoDisponible'
  | 'error.onboarding'
  | 'error.red'
  | 'error.generico';

/** Código → clave de texto (i18n de la feature). */
export function claveErrorAnalisis(codigo: string): ClaveErrorAnalisis {
  switch (codigo) {
    case 'limite_regeneracion':
      return 'error.limite';
    case 'limite_reintentos':
      return 'error.limiteReintentos';
    case 'en_curso':
      return 'error.enCurso';
    case 'generacion_fallida':
      return 'error.generacion';
    case 'mes_no_disponible':
      return 'error.mesNoDisponible';
    case 'onboarding_pendiente':
      return 'error.onboarding';
    case 'red':
      return 'error.red';
    default:
      return 'error.generico';
  }
}
