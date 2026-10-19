// Declaración mínima de los globals de Deno que usan las funciones, solo para
// `tsc -p supabase/functions` desde Node. Deno no carga este archivo.
declare namespace Deno {
  const env: { get(nombre: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
