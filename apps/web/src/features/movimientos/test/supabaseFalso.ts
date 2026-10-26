/**
 * Cliente de Supabase falso para los tests de la feature: cada `from(tabla)` devuelve un
 * constructor encadenable que apunta las llamadas y, al esperarlo, responde con `responder`.
 */
export interface Llamada {
  tabla: string;
  /** [método, ...argumentos] en orden: [['select', '...'], ['eq', 'id', 'x'], ...] */
  pasos: unknown[][];
}

export type Respuesta = { data: unknown; error: unknown };
export type Responder = (llamada: Llamada) => Respuesta;

const METODOS = [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'or',
  'gte',
  'lte',
  'in',
  'order',
  'limit',
  'maybeSingle',
  'single',
] as const;

export function crearSupabaseFalso() {
  const estado = {
    llamadas: [] as Llamada[],
    responder: (() => ({ data: [], error: null })) as Responder,
  };

  const from = (tabla: string) => {
    const llamada: Llamada = { tabla, pasos: [] };
    estado.llamadas.push(llamada);
    const builder: Record<string, unknown> = {};
    for (const m of METODOS) {
      builder[m] = (...args: unknown[]) => {
        llamada.pasos.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolver: (r: Respuesta) => unknown, rechazar?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => estado.responder(llamada))
        .then(resolver, rechazar);
    return builder;
  };

  /** RPC: se apunta como la tabla `rpc:<función>` con el paso ['rpc', argumentos]. */
  const rpc = (funcion: string, args?: unknown) => {
    const builder = from(`rpc:${funcion}`) as Record<string, unknown>;
    estado.llamadas[estado.llamadas.length - 1]?.pasos.push(['rpc', args]);
    return builder;
  };

  return { estado, supabase: { from, rpc } };
}

/** Primer paso con ese método, o undefined. */
export function paso(llamada: Llamada | undefined, metodo: string): unknown[] | undefined {
  return llamada?.pasos.find((p) => p[0] === metodo);
}

export function pasos(llamada: Llamada | undefined, metodo: string): unknown[][] {
  return llamada?.pasos.filter((p) => p[0] === metodo) ?? [];
}

export function operacion(llamada: Llamada): 'select' | 'insert' | 'update' | 'delete' {
  const op = llamada.pasos.find((p) => p[0] === 'insert' || p[0] === 'update' || p[0] === 'delete');
  return (op?.[0] as 'insert' | 'update' | 'delete' | undefined) ?? 'select';
}
