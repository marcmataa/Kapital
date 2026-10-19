import { vi } from 'vitest';

/**
 * Supabase falso para los tests de la feature: cada consulta (`from` o `rpc`) se registra con su
 * cadena de métodos y se resuelve con `estado.responder`. Uso:
 *   vi.mock('@/shared/lib/supabase', async () => (await import('./test/supabaseFalso')).moduloFalso);
 */
export interface Llamada {
  origen: 'from' | 'rpc';
  nombre: string;
  args: Record<string, unknown> | undefined;
  cadena: [string, unknown[]][];
}

export type Respuesta = { data: unknown; error: unknown };

export const estado = {
  llamadas: [] as Llamada[],
  responder: (_ll: Llamada): Respuesta => ({ data: null, error: null }),
  invoke: vi.fn(),
};

const METODOS = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'single', 'maybeSingle'];

function consulta(ll: Llamada) {
  estado.llamadas.push(ll);
  const obj: Record<string, unknown> = {};
  for (const m of METODOS) {
    obj[m] = (...a: unknown[]) => {
      ll.cadena.push([m, a]);
      return obj;
    };
  }
  obj.then = (ok: (r: Respuesta) => unknown, ko: (e: unknown) => unknown) =>
    Promise.resolve()
      .then(() => estado.responder(ll))
      .then(ok, ko);
  return obj;
}

/** Columnas pedidas con select() en una llamada. */
export function columnas(ll: Llamada): string {
  const s = ll.cadena.find(([m]) => m === 'select');
  return typeof s?.[1][0] === 'string' ? s[1][0] : '';
}

export function reiniciar(): void {
  estado.llamadas = [];
  estado.responder = () => ({ data: null, error: null });
  estado.invoke.mockReset();
}

export const moduloFalso = {
  supabase: {
    from: (tabla: string) => consulta({ origen: 'from', nombre: tabla, args: undefined, cadena: [] }),
    rpc: (nombre: string, args?: Record<string, unknown>) => consulta({ origen: 'rpc', nombre, args, cadena: [] }),
    functions: { invoke: (...a: unknown[]) => estado.invoke(...a) as unknown },
    auth: {},
  },
};

export const PERFIL = {
  user_id: '00000000-0000-0000-0000-000000000001',
  idioma: 'es',
  zona_horaria: 'Europe/Madrid',
  onboarding_completado: true,
};
