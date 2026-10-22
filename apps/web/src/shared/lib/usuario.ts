/**
 * Nombre del usuario a partir de `user.user_metadata` de Supabase Auth.
 * Con Google llegan `given_name`, `full_name` y/o `name`; con email y contraseña no suele haber nada.
 * No se guarda en la base: es solo para mostrarlo (saludo de Inicio y bloque de cuenta).
 */
export interface NombreUsuario {
  /** Nombre de pila: `given_name` o, si no, la primera palabra de `full_name` / `name`. */
  dePila: string | null;
  /** Nombre completo: `full_name`, `name` o, si no, `given_name`. */
  completo: string | null;
}

/** Texto limpio (sin espacios sobrantes) o null si no es un texto con contenido. */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/\s+/g, ' ').trim();
  return limpio === '' ? null : limpio;
}

export function nombreUsuario(metadata: unknown): NombreUsuario {
  const m = typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : {};
  const pila = texto(m.given_name);
  const completo = texto(m.full_name) ?? texto(m.name);
  return {
    dePila: pila ?? completo?.split(' ')[0] ?? null,
    completo: completo ?? pila,
  };
}
