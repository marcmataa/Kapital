import type { ClaveErrorAuth } from './errores';

/** Parámetros con los que Supabase Auth devuelve un error al volver del proveedor OAuth. */
const PARAMETROS_ERROR = ['error', 'error_code', 'error_description'] as const;

type ParametrosError = Partial<Record<(typeof PARAMETROS_ERROR)[number], string>>;

/** Error pendiente de mostrar en el login (se captura una sola vez, al arrancar la web). */
let pendiente: ClaveErrorAuth | null = null;

function hashComoParametros(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

/** Lee los parámetros de error del hash y de la query (la query manda, como en supabase-js). */
function leerParametros(url: URL): ParametrosError {
  const hash = hashComoParametros(url.hash);
  const resultado: ParametrosError = {};
  for (const clave of PARAMETROS_ERROR) {
    const valor = url.searchParams.get(clave) ?? hash.get(clave);
    if (valor !== null) resultado[clave] = valor;
  }
  return resultado;
}

/**
 * Error OAuth → clave de texto. Nunca se muestra error_description: solo se usa para distinguir
 * el rechazo del trigger de registro restringido (GoTrue lo devuelve como
 * «Database error saving new user») del resto de fallos.
 */
export function claveErrorOAuth(parametros: ParametrosError): ClaveErrorAuth | null {
  const { error, error_code: codigo = '', error_description: descripcion = '' } = parametros;
  if (error === undefined && codigo === '' && descripcion === '') return null;
  const texto = `${codigo} ${descripcion}`.toLowerCase();
  if (
    texto.includes('database error saving new user') ||
    texto.includes('registro_cerrado') ||
    codigo === 'signup_disabled'
  ) {
    return 'error.sinAcceso';
  }
  return 'error.google';
}

/** Quita de la URL solo los parámetros de error; `?code=` y el resto se conservan. */
function urlSinError(url: URL): string {
  const limpia = new URL(url.href);
  for (const clave of PARAMETROS_ERROR) limpia.searchParams.delete(clave);
  if (limpia.hash) {
    const hash = hashComoParametros(limpia.hash);
    if (PARAMETROS_ERROR.some((clave) => hash.has(clave))) {
      for (const clave of PARAMETROS_ERROR) hash.delete(clave);
      const resto = hash.toString();
      limpia.hash = resto ? `#${resto}` : '';
    }
  }
  return `${limpia.pathname}${limpia.search}${limpia.hash}`;
}

/**
 * Se llama al arrancar, antes de que el router redirija a /login (que perdería la query y el
 * hash). Guarda el error para el login y limpia la URL.
 */
export function capturarErrorOAuth(): void {
  const url = new URL(window.location.href);
  const clave = claveErrorOAuth(leerParametros(url));
  if (clave === null) return;
  pendiente = clave;
  window.history.replaceState(window.history.state, '', urlSinError(url));
}

/** Error capturado al volver de Google que aún no se ha mostrado (no lo borra). */
export function errorOAuthPendiente(): ClaveErrorAuth | null {
  return pendiente;
}

/** Marca el error como mostrado para no repetirlo al volver a entrar en el login. */
export function descartarErrorOAuth(): void {
  pendiente = null;
}
