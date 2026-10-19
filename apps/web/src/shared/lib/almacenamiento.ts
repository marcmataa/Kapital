/**
 * Acceso a localStorage que nunca lanza (modo privado, almacenamiento bloqueado…).
 * Solo para preferencias del dispositivo (tema, idioma antes del login). Nunca datos financieros.
 */
export function leerLocal(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function guardarLocal(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // preferencia no persistida: no es crítico
  }
}
