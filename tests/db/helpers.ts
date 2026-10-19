import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const raiz = new URL('../../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), 'utf8');

const STUB = leer('tests/db/supabase-stub.sql');
export const MIGRACION = leer('supabase/migrations/20261015000000_esquema_inicial.sql');
export const ROLLBACK = leer('supabase/rollback/20261015000000_esquema_inicial.down.sql');
export const MIGRACION_ONBOARDING = leer('supabase/migrations/20261019000000_onboarding_y_analisis.sql');
export const ROLLBACK_ONBOARDING = leer('supabase/rollback/20261019000000_onboarding_y_analisis.down.sql');
/** Todas las migraciones, en orden de aplicación. */
export const MIGRACIONES = [MIGRACION, MIGRACION_ONBOARDING];
/** Todos los rollbacks, en orden inverso. */
export const ROLLBACKS = [ROLLBACK_ONBOARDING, ROLLBACK];

export type TipoMovimiento = 'gasto' | 'ingreso' | 'devolucion' | 'traspaso' | 'ajuste';
export type TipoCuenta = 'banco' | 'efectivo' | 'inversion' | 'pasivo' | 'por_cobrar';
type Fila = Record<string, unknown>;

/**
 * Base nueva: simulación mínima de Supabase + todas las migraciones reales.
 * El registro se abre para que los tests puedan crear usuarios; los tests del
 * registro restringido usan `{ registroAbierto: false }`.
 */
export async function crearDb(o: { registroAbierto?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB);
  for (const m of MIGRACIONES) await db.exec(m);
  if (o.registroAbierto ?? true) await db.exec('update registro_config set abierto = true');
  return db;
}

/** Primera fila de una consulta parametrizada. Los importes se piden como ::text para compararlos exactos. */
export async function una<T extends Fila = Fila>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  const fila = rows[0];
  if (!fila) throw new Error(`Sin filas: ${sql}`);
  return fila;
}

export async function todas<T extends Fila = Fila>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Simula la sesión de Supabase: auth.uid() devuelve este usuario. */
export async function actuarComo(db: PGlite, userId: string | null): Promise<void> {
  await db.query(
    `select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', '', false)`,
    [userId ?? ''],
  );
}

/** Usuario nuevo; el trigger de auth.users le crea el perfil (Europe/Madrid). Cada test usa el suyo. */
export async function crearUsuario(db: PGlite): Promise<string> {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@test.local`]);
  await actuarComo(db, id);
  return id;
}

export async function crearCuenta(
  db: PGlite,
  userId: string,
  o: { nombre: string; tipo?: TipoCuenta; saldoInicial?: string; fechaInicial?: string; principal?: boolean },
): Promise<string> {
  const fila = await una<{ id: string }>(
    db,
    `insert into cuentas (user_id, nombre, tipo, saldo_inicial, fecha_inicial, es_principal)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [userId, o.nombre, o.tipo ?? 'banco', o.saldoInicial ?? '0', o.fechaInicial ?? '2026-01-01', o.principal ?? false],
  );
  return fila.id;
}

export async function crearCategoria(db: PGlite, userId: string, nombre: string, tipo: 'gasto' | 'ingreso'): Promise<string> {
  const fila = await una<{ id: string }>(
    db,
    `insert into categorias (user_id, nombre, tipo) values ($1, $2, $3) returning id`,
    [userId, nombre, tipo],
  );
  return fila.id;
}

export interface NuevoMovimiento {
  tipo: TipoMovimiento;
  importe: string;
  fecha: string;
  cuenta: string;
  destino?: string;
  categoria?: string;
  sentido?: 'suma' | 'resta';
  devolucionDe?: string;
  metodo?: string;
}

export async function mov(db: PGlite, userId: string, m: NuevoMovimiento): Promise<string> {
  const fila = await una<{ id: string }>(
    db,
    `insert into movimientos (user_id, tipo, importe, fecha, cuenta_id, cuenta_destino_id, categoria_id,
                              sentido, devolucion_de, metodo, concepto)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [userId, m.tipo, m.importe, m.fecha, m.cuenta, m.destino ?? null, m.categoria ?? null,
     m.sentido ?? null, m.devolucionDe ?? null, m.metodo ?? null, `${m.tipo} de prueba`],
  );
  return fila.id;
}

/** Valoración de una cuenta de inversión; otra el mismo día la sustituye. */
export async function valorar(db: PGlite, userId: string, cuenta: string, fecha: string, valor: string): Promise<void> {
  await db.query(
    `insert into valoraciones (user_id, cuenta_id, fecha, valor) values ($1, $2, $3, $4)
     on conflict (cuenta_id, fecha) do update set valor = excluded.valor`,
    [userId, cuenta, fecha, valor],
  );
}

export async function valorCuenta(db: PGlite, cuenta: string, fecha: string): Promise<string | null> {
  return (await una<{ v: string | null }>(db, `select valor_cuenta($1, $2)::text as v`, [cuenta, fecha])).v;
}

export async function patrimonio(db: PGlite, fecha: string): Promise<string | null> {
  return (await una<{ v: string | null }>(db, `select patrimonio($1)::text as v`, [fecha])).v;
}

export type Resumen = {
  ingresos: string; gastos: string; devoluciones: string; gastos_netos: string;
  balance: string; ahorro_pct: string | null; ahorro_1d: string | null; ajustes: string;
};

/** Balance de un periodo. `ahorro_1d` es el porcentaje redondeado a 1 decimal, como se muestra. */
export async function resumen(db: PGlite, desde: string, hasta: string): Promise<Resumen> {
  return una<Resumen>(
    db,
    `select ingresos::text, gastos::text, devoluciones::text, gastos_netos::text, balance::text,
            ahorro_pct::text, round(ahorro_pct, 1)::text as ahorro_1d, ajustes::text
     from resumen_periodo($1, $2)`,
    [desde, hasta],
  );
}

/** Ejecuta `fn` con un rol de Supabase (anon / authenticated), como lo haría PostgREST. */
export async function conRol<T>(
  db: PGlite, rol: 'anon' | 'authenticated' | 'service_role', fn: () => Promise<T>,
): Promise<T> {
  const roles = { anon: 'anon', authenticated: 'authenticated', service_role: 'service_role' } as const;
  await db.exec(`set role ${roles[rol]}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
