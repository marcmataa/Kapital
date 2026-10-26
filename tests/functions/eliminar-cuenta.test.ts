/**
 * Edge Function eliminar-cuenta: solo borra al usuario del JWT verificado, con
 * confirmación (su email), reautenticación reciente, CORS limitado a APP_ORIGIN y
 * logs sin datos personales. Datos inventados.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  crearHandler,
  leerClaims,
  REAUTENTICACION_MAX_MS,
  type DependenciasEliminar,
  type UsuarioVerificado,
} from '../../supabase/functions/_shared/eliminar-cuenta/handler.ts';

const AHORA = new Date('2026-10-26T10:00:00Z');
const ORIGEN = 'https://kapital.app';
const EMAIL = 'persona@example.com';
const USUARIO: UsuarioVerificado = { id: '11111111-1111-4111-8111-111111111111', email: EMAIL };

const base64url = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** JWT con cabecera y firma falsas: la verificación la hace la dependencia `verificarJwt`. */
function jwt(claims: Record<string, unknown>): string {
  return `${base64url('{"alg":"HS256"}')}.${base64url(JSON.stringify(claims))}.firma`;
}

/** Inicio de sesión hace `msAtras` milisegundos. */
const jwtReciente = (msAtras = 60_000, sub = USUARIO.id) =>
  jwt({ sub, amr: [{ method: 'password', timestamp: Math.floor((AHORA.getTime() - msAtras) / 1000) }] });

function montar(opts: { usuario?: UsuarioVerificado | null; borrar?: () => Promise<void> } = {}) {
  const logs: Record<string, string | number>[] = [];
  const deps = {
    verificarJwt: vi.fn(async () => (opts.usuario === undefined ? USUARIO : opts.usuario)),
    borrarUsuario: vi.fn(opts.borrar ?? (async () => undefined)),
    origenesPermitidos: [ORIGEN],
    ahora: () => AHORA,
    log: (e: Record<string, string | number>) => logs.push(e),
  } satisfies DependenciasEliminar;
  return { handler: crearHandler(deps), deps, logs };
}

function peticion(cuerpo: unknown, opts: { token?: string | null; origin?: string | null; method?: string } = {}) {
  const headers: Record<string, string> = {};
  const token = opts.token === undefined ? jwtReciente() : opts.token;
  if (token !== null) headers['authorization'] = `Bearer ${token}`;
  const origin = opts.origin === undefined ? ORIGEN : opts.origin;
  if (origin !== null) headers['origin'] = origin;
  const method = opts.method ?? 'POST';
  return new Request('http://x/eliminar-cuenta', {
    method,
    headers,
    ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }),
  });
}

describe('eliminar-cuenta', () => {
  it('con JWT válido, sesión reciente y su email → borra SOLO a ese usuario (200)', async () => {
    const { handler, deps, logs } = montar();
    const r = await handler(peticion({ confirmacion: '  Persona@Example.com ' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(deps.borrarUsuario).toHaveBeenCalledExactlyOnceWith(USUARIO.id);
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGEN);
    expect(logs).toEqual([{ evento: 'cuenta_eliminada' }]);
  });

  it('el id a borrar sale del JWT verificado, nunca del cuerpo (claves extra → 400)', async () => {
    const { handler, deps } = montar();
    const r = await handler(peticion({ confirmacion: EMAIL, user_id: '22222222-2222-4222-8222-222222222222' }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'cuerpo_invalido' });
    expect(deps.borrarUsuario).not.toHaveBeenCalled();
  });

  it('sin Authorization o con un JWT que Auth no valida → 401 sin borrar', async () => {
    const sinToken = montar();
    expect((await sinToken.handler(peticion({ confirmacion: EMAIL }, { token: null }))).status).toBe(401);
    expect(sinToken.deps.verificarJwt).not.toHaveBeenCalled();

    const invalido = montar({ usuario: null });
    const r = await invalido.handler(peticion({ confirmacion: EMAIL }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'no_autenticado' });
    expect(invalido.deps.borrarUsuario).not.toHaveBeenCalled();
  });

  it('un JWT cuyo sub no es el del usuario verificado → 401', async () => {
    const { handler, deps } = montar();
    const r = await handler(peticion({ confirmacion: EMAIL }, { token: jwtReciente(60_000, 'otro-id') }));
    expect(r.status).toBe(401);
    expect(deps.borrarUsuario).not.toHaveBeenCalled();
  });

  it('confirmación que no es su email (o vacía) → 400 confirmacion_invalida', async () => {
    const { handler, deps } = montar();
    for (const confirmacion of ['otra@example.com', '', 'persona@example']) {
      const r = await handler(peticion({ confirmacion }));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'confirmacion_invalida' });
    }
    expect((await handler(peticion({}))).status).toBe(400);
    expect(deps.borrarUsuario).not.toHaveBeenCalled();
  });

  it('un usuario sin email no puede confirmar → 400', async () => {
    const { handler, deps } = montar({ usuario: { id: USUARIO.id, email: null } });
    expect((await handler(peticion({ confirmacion: '' }))).status).toBe(400);
    expect(deps.borrarUsuario).not.toHaveBeenCalled();
  });

  it('exige reautenticación reciente: sesión de hace más de 10 min, sin amr o en el futuro → 403', async () => {
    const { handler, deps } = montar();
    const casos = [
      jwtReciente(REAUTENTICACION_MAX_MS + 1000),
      jwt({ sub: USUARIO.id }),
      jwtReciente(-5 * 60_000),
    ];
    for (const token of casos) {
      const r = await handler(peticion({ confirmacion: EMAIL }, { token }));
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: 'reautenticacion_requerida' });
    }
    // Justo dentro del margen: vale.
    expect((await handler(peticion({ confirmacion: EMAIL }, { token: jwtReciente(REAUTENTICACION_MAX_MS - 1000) }))).status).toBe(200);
    expect(deps.borrarUsuario).toHaveBeenCalledOnce();
  });

  it('CORS: origen no permitido → 403; OPTIONS permitido → 204 sin «*»; OPTIONS sin origen → 403', async () => {
    const { handler, deps } = montar();
    expect((await handler(peticion({ confirmacion: EMAIL }, { origin: 'https://evil.example' }))).status).toBe(403);
    const pre = await handler(peticion(null, { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGEN);
    expect((await handler(peticion(null, { method: 'OPTIONS', origin: null }))).status).toBe(403);
    expect(deps.borrarUsuario).not.toHaveBeenCalled();
  });

  it('solo POST; cuerpo no JSON o demasiado grande → 400/413', async () => {
    const { handler, deps } = montar();
    expect((await handler(peticion(null, { method: 'GET' }))).status).toBe(405);
    expect((await handler(peticion('no es json'))).status).toBe(400);
    expect((await handler(peticion('x'.repeat(5000)))).status).toBe(413);
    expect(deps.borrarUsuario).not.toHaveBeenCalled();
  });

  it('si la API admin falla → 500 genérico y log sin datos personales', async () => {
    const { handler, logs } = montar({ borrar: async () => { throw new Error(`fallo borrando ${EMAIL}`); } });
    const r = await handler(peticion({ confirmacion: EMAIL }));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'error_interno' });
    expect(JSON.stringify(logs)).not.toContain(EMAIL);
    expect(JSON.stringify(logs)).not.toContain(USUARIO.id);
  });

  it('ningún log lleva el email ni el id del usuario', async () => {
    const { handler, logs } = montar();
    await handler(peticion({ confirmacion: 'otra@example.com' }));
    await handler(peticion({ confirmacion: EMAIL }, { token: jwtReciente(REAUTENTICACION_MAX_MS * 2) }));
    await handler(peticion({ confirmacion: EMAIL }));
    const todo = JSON.stringify(logs);
    expect(todo).not.toContain(EMAIL);
    expect(todo).not.toContain('otra@example.com');
    expect(todo).not.toContain(USUARIO.id);
  });

  it('leerClaims: JWT mal formado → null', () => {
    expect(leerClaims('a.b')).toBeNull();
    expect(leerClaims('a.!!!.c')).toBeNull();
    expect(leerClaims(jwt({ amr: [] }))).toBeNull();
  });
});

describe('eliminar-cuenta: despliegue', () => {
  const raiz = new URL('../../', import.meta.url);
  const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

  it('config.toml deja verify_jwt activado para la función', () => {
    expect(leer('supabase/config.toml')).toMatch(/\[functions\.eliminar-cuenta\]\s*\r?\nverify_jwt = true/);
  });

  it('index.ts borra con la API admin el id que devuelve getUser y no registra datos del usuario', () => {
    const index = leer('supabase/functions/eliminar-cuenta/index.ts');
    expect(index).toContain('admin.auth.getUser(jwt)');
    expect(index).toContain('admin.auth.admin.deleteUser(userId)');
    expect(index).not.toMatch(/console\.log\((?!JSON\.stringify\(evento\))/);
  });

  it('todas las tablas con user_id se borran en cascada al borrar el usuario de Auth', () => {
    const esquema = leer('supabase/migrations/20261015000000_esquema_inicial.sql');
    const referencias = [...esquema.matchAll(/references auth\.users[^,\n]*/g)].map((m) => m[0]);
    expect(referencias.length).toBeGreaterThanOrEqual(7);
    for (const r of referencias) expect(r).toContain('on delete cascade');
  });
});
