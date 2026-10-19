import { describe, expect, it, vi } from 'vitest';
import { datosAnalisisSchema } from '../../supabase/functions/_shared/analisis/esquemas.ts';
import {
  AnalisisError,
  generarAnalisis,
  URL_OPENAI,
} from '../../supabase/functions/_shared/analisis/generar.ts';
import {
  crearHandler,
  type ClienteUsuario,
  type DependenciasHandler,
  type FilaAnalisis,
  type RepositorioServicio,
} from '../../supabase/functions/_shared/analisis/handler.ts';
import {
  parsearOrigenes,
  secretosIguales,
} from '../../supabase/functions/_shared/analisis/http.ts';
import { esMesValido, mesAnterior } from '../../supabase/functions/_shared/analisis/mes.ts';
import {
  construirMensajes,
  formatearEuros,
} from '../../supabase/functions/_shared/analisis/prompt.ts';

// Datos inventados (no son del usuario).
function datosBase(): Record<string, unknown> {
  const resumen = {
    ingresos: '2000.00',
    gastos: '1250.50',
    devoluciones: '50.50',
    gastos_netos: '1200.00',
    balance: '800.00',
    ahorro_pct: '40.0000000000',
    ajustes: '0.00',
  };
  return {
    mes: '2026-09-01',
    mes_incompleto: false,
    idioma: 'es',
    resumen,
    resumen_mes_anterior: { ...resumen, balance: '700.00' },
    categorias: [{ nombre: 'Ocio', color: '#ff0000', gasto: '40.00' }],
    categorias_mes_anterior: [{ nombre: 'Ocio', color: '#ff0000', gasto: '60.00' }],
    metodos: [{ metodo: 'tarjeta', gasto: '1000.00' }],
    variacion: {
      patrimonio_inicial: '10000.00',
      patrimonio_final: '10850.00',
      balance: '800.00',
      revalorizacion: '50.00',
      ajustes: '0.00',
      saldos_iniciales: '0.00',
      variacion: '850.00',
    },
    objetivos: [{ tipo: 'ahorro_mensual', categoria: null, importe: '500.00', actual: '800.00' }],
  };
}

const contenidoValido = {
  resumen: 'Buen mes.',
  destacados: ['Uno', 'Dos'],
  recomendaciones: ['Tres', 'Cuatro'],
};

function respuestaOpenAI(contenido: unknown, init: ResponseInit = {}): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: typeof contenido === 'string' ? contenido : JSON.stringify(contenido),
          },
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' }, ...init },
  );
}

describe('mesAnterior', () => {
  it('cruza el cambio de año', () => {
    expect(mesAnterior(new Date('2026-01-15T12:00:00Z'))).toBe('2025-12-01');
  });

  it('usa el día en Madrid: 2026-10-31T23:30Z ya es 1 de noviembre → octubre', () => {
    expect(mesAnterior(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10-01');
  });

  it('1 de enero a las 00:30 en Madrid (31-dic UTC) → diciembre', () => {
    expect(mesAnterior(new Date('2025-12-31T23:30:00Z'))).toBe('2025-12-01');
  });

  it('valida el formato YYYY-MM-01', () => {
    expect(esMesValido('2026-09-01')).toBe(true);
    expect(esMesValido('2026-09-02')).toBe(false);
    expect(esMesValido('2026-13-01')).toBe(false);
    expect(esMesValido(20260901)).toBe(false);
  });
});

describe('datosAnalisisSchema', () => {
  it('acepta el contrato con importes como texto', () => {
    expect(datosAnalisisSchema.safeParse(datosBase()).success).toBe(true);
  });

  it('rechaza importes enviados como número JSON', () => {
    const d = datosBase();
    d['resumen'] = { ...(d['resumen'] as object), balance: 800 };
    expect(datosAnalisisSchema.safeParse(d).success).toBe(false);
  });

  it('rechaza importes con formato no numérico', () => {
    const d = datosBase();
    d['resumen'] = { ...(d['resumen'] as object), gastos: '1.250,50' };
    expect(datosAnalisisSchema.safeParse(d).success).toBe(false);
  });

  it('elimina las claves desconocidas', () => {
    const d = datosBase();
    d['movimientos'] = [{ concepto: 'Mercadona', notas: 'secreto' }];
    d['categorias'] = [{ nombre: 'Ocio', color: null, gasto: '1.00', comercio: 'Cine X' }];
    const r = datosAnalisisSchema.parse(d);
    expect(r).not.toHaveProperty('movimientos');
    expect(r.categorias[0]).not.toHaveProperty('comercio');
  });

  it('idioma desconocido cae a es', () => {
    expect(datosAnalisisSchema.parse({ ...datosBase(), idioma: 'fr' }).idioma).toBe('es');
  });
});

describe('construirMensajes', () => {
  const PERMITIDAS = new Set([
    'mes',
    'mes_incompleto',
    'resumen',
    'resumen_mes_anterior',
    'categorias',
    'categorias_mes_anterior',
    'metodos',
    'variacion',
    'objetivos',
    'ingresos',
    'gastos',
    'devoluciones',
    'gastos_netos',
    'balance',
    'ahorro_pct',
    'ajustes',
    'nombre',
    'gasto',
    'metodo',
    'patrimonio_inicial',
    'patrimonio_final',
    'revalorizacion',
    'saldos_iniciales',
    'tipo',
    'categoria',
    'importe',
    'actual',
  ]);

  function clavesDe(valor: unknown, acc = new Set<string>()): Set<string> {
    if (Array.isArray(valor)) valor.forEach((v) => clavesDe(v, acc));
    else if (valor && typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor)) {
        acc.add(k);
        clavesDe(v, acc);
      }
    }
    return acc;
  }

  function datosDelPrompt(contenido: string): unknown {
    return JSON.parse(contenido.slice(contenido.indexOf('\n') + 1));
  }

  it('solo envía agregados permitidos, aunque lleguen claves extra', () => {
    const d = datosBase();
    d['movimientos'] = [{ concepto: 'Mercadona', notas: 'nota privada' }];
    d['email'] = 'alguien@example.com';
    const [system, user] = construirMensajes(d);
    expect(system?.role).toBe('system');
    expect(user?.role).toBe('user');
    const claves = clavesDe(datosDelPrompt(user?.content ?? ''));
    for (const k of claves) expect(PERMITIDAS.has(k), `clave no permitida: ${k}`).toBe(true);
    const todo = `${system?.content ?? ''}${user?.content ?? ''}`;
    expect(todo).not.toContain('Mercadona');
    expect(todo).not.toContain('nota privada');
    expect(todo).not.toContain('example.com');
  });

  it('formatea importes en euros según el idioma', () => {
    const [, user] = construirMensajes(datosBase());
    expect(user?.content).toContain('1.200,00 €');
    expect(user?.content).toContain('40,0 %');
    expect(formatearEuros('1508.005', 'en')).toBe('€1,508.01');
  });

  it('escribe las instrucciones en el idioma elegido', () => {
    const es = construirMensajes(datosBase())[0]?.content ?? '';
    const en = construirMensajes({ ...datosBase(), idioma: 'en' })[0]?.content ?? '';
    const ca = construirMensajes({ ...datosBase(), idioma: 'ca' })[0]?.content ?? '';
    expect(es).toContain('Balance mensual');
    expect(en).toContain('Monthly balance');
    expect(en).toContain('Net worth change');
    expect(ca).toContain('Variació patrimonial');
    const [, userEn] = construirMensajes({ ...datosBase(), idioma: 'en' });
    expect(userEn?.content).toContain('€1,200.00');
  });

  it('ahorro null llega como null (sin ingresos)', () => {
    const d = datosBase();
    d['resumen'] = { ...(d['resumen'] as object), ingresos: '0.00', ahorro_pct: null };
    const [, user] = construirMensajes(d);
    const datos = datosDelPrompt(user?.content ?? '') as { resumen: { ahorro_pct: unknown } };
    expect(datos.resumen.ahorro_pct).toBeNull();
  });
});

describe('generarAnalisis', () => {
  const deps = (fetchMock: typeof fetch, timeoutMs?: number) => ({
    fetch: fetchMock,
    apiKey: 'sk-test-falsa',
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

  it('éxito: llama a OpenAI con esquema estricto y devuelve el contenido validado', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => respuestaOpenAI(contenidoValido));
    const r = await generarAnalisis(datosBase(), deps(fetchMock));
    expect(r).toEqual({ contenido: contenidoValido, modelo: 'gpt-4o-mini' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(URL_OPENAI);
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      response_format: { type: string; json_schema: { strict: boolean } };
    };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('HTTP 500 → openai_http sin el texto del proveedor', async () => {
    const textoProveedor = 'Incorrect API key provided: sk-xxxx';
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: { message: textoProveedor } }), { status: 500 }),
    );
    const error = await generarAnalisis(datosBase(), deps(fetchMock)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnalisisError);
    expect((error as AnalisisError).codigo).toBe('openai_http');
    expect((error as AnalisisError).message).not.toContain('Incorrect');
    expect(JSON.stringify(error)).not.toContain('sk-');
  });

  it('contenido que no es JSON → respuesta_invalida', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => respuestaOpenAI('esto no es json'));
    await expect(generarAnalisis(datosBase(), deps(fetchMock))).rejects.toMatchObject({
      codigo: 'respuesta_invalida',
    });
  });

  it('JSON fuera de esquema → respuesta_invalida', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      respuestaOpenAI({ ...contenidoValido, destacados: ['solo uno'] }),
    );
    await expect(generarAnalisis(datosBase(), deps(fetchMock))).rejects.toMatchObject({
      codigo: 'respuesta_invalida',
    });
  });

  it('cuerpo de OpenAI sin choices → respuesta_invalida', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    await expect(generarAnalisis(datosBase(), deps(fetchMock))).rejects.toMatchObject({
      codigo: 'respuesta_invalida',
    });
  });

  it('timeout → openai_timeout', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await expect(generarAnalisis(datosBase(), deps(fetchMock, 20))).rejects.toMatchObject({
      codigo: 'openai_timeout',
    });
  });
});

describe('http', () => {
  it('compara secretos', async () => {
    expect(await secretosIguales('a'.repeat(40), 'a'.repeat(40))).toBe(true);
    expect(await secretosIguales('a'.repeat(40), 'b'.repeat(40))).toBe(false);
    expect(await secretosIguales('', 'a')).toBe(false);
  });

  it('APP_ORIGIN nunca admite *', () => {
    expect(parsearOrigenes('https://kapital.app, *, http://localhost:5173/')).toEqual([
      'https://kapital.app',
      'http://localhost:5173',
    ]);
  });
});

describe('crearHandler', () => {
  const AHORA = new Date('2026-10-19T10:00:00Z');
  const SECRETO = 'c'.repeat(40);
  const ORIGEN = 'https://kapital.app';

  function fila(parcial: Partial<FilaAnalisis> = {}): FilaAnalisis {
    return {
      id: 'a1',
      user_id: 'u1',
      mes: '2026-09-01',
      estado: 'pendiente',
      intentos: 0,
      updated_at: '2026-10-19T09:00:00Z',
      ...parcial,
    };
  }

  function montar(opts: { fila?: FilaAnalisis | null; regeneracion?: 'ok' | 'limite_regeneracion' } = {}) {
    const servicio = {
      usuariosConOnboarding: vi.fn(async () => ['u1']),
      onboardingCompletado: vi.fn(async () => true),
      crearPendientes: vi.fn(async () => undefined),
      filasProcesables: vi.fn(async () => [fila()]),
      obtenerFila: vi.fn(async () => (opts.fila === undefined ? fila() : opts.fila)),
      reclamar: vi.fn(async () => true),
      datosAnalisis: vi.fn(async () => datosBase()),
      guardarListo: vi.fn(async () => undefined),
      guardarError: vi.fn(async () => undefined),
    } satisfies RepositorioServicio;
    const usuario: ClienteUsuario = {
      usuarioId: async () => 'u1',
      solicitarRegeneracion: vi.fn(async () => opts.regeneracion ?? 'ok'),
    };
    const logs: Record<string, string | number>[] = [];
    const deps: DependenciasHandler = {
      servicio,
      clienteUsuario: () => usuario,
      generar: vi.fn(async () => ({ contenido: contenidoValido, modelo: 'gpt-4o-mini' })),
      cronSecret: SECRETO,
      origenesPermitidos: [ORIGEN],
      ahora: () => AHORA,
      log: (e) => logs.push(e),
    };
    return { handler: crearHandler(deps), servicio, usuario, deps, logs };
  }

  const peticionUsuario = (body: string, headers: Record<string, string> = {}) =>
    new Request('http://x/analisis-mensual', {
      method: 'POST',
      body,
      headers: { authorization: 'Bearer jwt', origin: ORIGEN, ...headers },
    });

  it('cron con secreto incorrecto → 401 y no toca la base', async () => {
    const { handler, servicio } = montar();
    const r = await handler(
      new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': 'mal' } }),
    );
    expect(r.status).toBe(401);
    expect(servicio.usuariosConOnboarding).not.toHaveBeenCalled();
  });

  it('cron crea pendientes del mes anterior y procesa', async () => {
    const { handler, servicio } = montar();
    const r = await handler(
      new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': SECRETO } }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(servicio.crearPendientes).toHaveBeenCalledWith(['u1'], '2026-09-01');
    expect(servicio.guardarListo).toHaveBeenCalledOnce();
  });

  it('error de OpenAI → fila en error con código genérico y log sin datos', async () => {
    const { handler, servicio, deps, logs } = montar();
    deps.generar = async () => {
      throw new AnalisisError('openai_http');
    };
    const h = crearHandler(deps);
    void handler;
    const r = await h(peticionUsuario('{"mes":"2026-09-01"}'));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'generacion_fallida' });
    expect(servicio.guardarError).toHaveBeenCalledWith('a1', 'openai_http');
    expect(JSON.stringify(logs)).not.toContain('2000');
  });

  it('origen no permitido → 403; OPTIONS permitido → 204 con CORS sin *', async () => {
    const { handler } = montar();
    const malo = await handler(peticionUsuario('{}', { origin: 'https://evil.example' }));
    expect(malo.status).toBe(403);
    const pre = await handler(
      new Request('http://x', { method: 'OPTIONS', headers: { origin: ORIGEN } }),
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGEN);
  });

  it('valida cuerpo: claves extra, mes en curso y tamaño', async () => {
    const { handler } = montar();
    expect((await handler(peticionUsuario('{"mes":"2026-09-01","x":1}'))).status).toBe(400);
    const enCurso = await handler(peticionUsuario('{"mes":"2026-10-01"}'));
    expect(await enCurso.json()).toEqual({ error: 'mes_no_disponible' });
    expect((await handler(peticionUsuario('x'.repeat(2000)))).status).toBe(413);
    expect((await handler(peticionUsuario('{"mes":"2026-09-01"}', { authorization: '' }))).status).toBe(401);
  });

  it('fila existente lista → solicita regeneración; límite → 429', async () => {
    const { handler, usuario } = montar({
      fila: fila({ estado: 'listo' }),
      regeneracion: 'limite_regeneracion',
    });
    const r = await handler(peticionUsuario('{"mes":"2026-09-01"}'));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'limite_regeneracion' });
    expect(usuario.solicitarRegeneracion).toHaveBeenCalledWith('2026-09-01');
  });

  it('sin fila → la crea sin gastar la regeneración', async () => {
    const { handler, servicio, usuario } = montar();
    servicio.obtenerFila.mockResolvedValueOnce(null);
    const r = await handler(peticionUsuario('{"mes":"2026-09-01"}'));
    expect(r.status).toBe(200);
    expect(servicio.crearPendientes).toHaveBeenCalledWith(['u1'], '2026-09-01');
    expect(usuario.solicitarRegeneracion).not.toHaveBeenCalled();
  });
});
