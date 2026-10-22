-- =====================================================================
--  Kapital · Onboarding, registro restringido y análisis mensual
--
--  Contrato: docs/diseno/web-v1.md («Base de datos»).
--  Reglas:   docs/reglas-financieras.md (mandan sobre el contrato).
--  Rollback: supabase/rollback/20261019000000_onboarding_y_analisis.down.sql
--
--  Permisos: Supabase concede EXECUTE (y PUBLIC también) sobre toda función
--  nueva, y ALL sobre toda tabla nueva. Al final se revoca función a función
--  y se concede solo lo necesario.
-- =====================================================================


-- ---------------------------------------------------------------- Perfiles
alter table perfiles add column onboarding_completado boolean not null default false;


-- ---------------------------------------------------------------- Bancos: catálogo, color y límite
alter table cuentas
  add column entidad text check (entidad in (
    'caixabank', 'santander', 'bbva', 'sabadell', 'bankinter',
    'ing', 'unicaja', 'openbank', 'revolut', 'trade_republic')),
  add column color text check (color ~ '^#[0-9A-Fa-f]{6}$');

-- Nombre visible de cada entidad del catálogo (NULL si no está en él).
create function nombre_entidad(p_entidad text) returns text
language sql immutable set search_path = public as $$
  select case p_entidad
    when 'caixabank'      then 'CaixaBank'
    when 'santander'      then 'Santander'
    when 'bbva'           then 'BBVA'
    when 'sabadell'       then 'Banco Sabadell'
    when 'bankinter'      then 'Bankinter'
    when 'ing'            then 'ING'
    when 'unicaja'        then 'Unicaja'
    when 'openbank'       then 'Openbank'
    when 'revolut'        then 'Revolut'
    when 'trade_republic' then 'Trade Republic'
  end
$$;

-- Máximo 5 cuentas de tipo banco no cerradas por usuario. Cubre altas,
-- cambios de tipo y reaperturas.
create function validar_limite_bancos() returns trigger
language plpgsql set search_path = public as $$
declare v_abiertos int;
begin
  if new.tipo <> 'banco' or new.fecha_cierre is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.tipo = 'banco' and old.fecha_cierre is null and old.user_id = new.user_id then
    return new;   -- ya contaba: no cambia nada
  end if;
  -- Dos altas simultáneas del mismo usuario no pueden saltarse el límite.
  perform pg_advisory_xact_lock(hashtextextended('kapital:bancos:' || new.user_id::text, 0));
  select count(*) into v_abiertos from cuentas c
  where c.user_id = new.user_id and c.tipo = 'banco' and c.fecha_cierre is null and c.id <> new.id;
  if v_abiertos >= 5 then
    raise exception 'Ya tienes 5 bancos abiertos, que es el máximo. Cierra uno para añadir otro.'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger cuentas_limite_bancos before insert or update on cuentas
  for each row execute function validar_limite_bancos();


-- ---------------------------------------------------------------- Registro restringido
-- Hasta el lanzamiento público solo se registran los emails permitidos.
-- Se gestionan desde el SQL Editor:
--   insert into registro_permitidos (email) values ('alguien@ejemplo.com');
--   update registro_config set abierto = true;   -- abrir a todo el mundo
create table registro_config (
  id          boolean primary key default true check (id),   -- una sola fila
  abierto     boolean not null default false,
  updated_at  timestamptz not null default now()
);
insert into registro_config (id, abierto) values (true, false);

create table registro_permitidos (
  email       text primary key check (btrim(email) <> ''),
  created_at  timestamptz not null default now()
);
create unique index registro_permitidos_email_lower on registro_permitidos (lower(btrim(email)));

alter table registro_config     enable row level security;
alter table registro_permitidos enable row level security;
revoke all on registro_config, registro_permitidos from anon, authenticated;

-- Antes de crear el usuario en Auth (email + contraseña o Google).
create function validar_registro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select rc.abierto from registro_config rc where rc.id), false) then
    return new;
  end if;
  if new.email is not null and exists (
    select 1 from registro_permitidos rp where lower(btrim(rp.email)) = lower(btrim(new.email))
  ) then
    return new;
  end if;
  -- Sin el email en el mensaje: no se registran datos personales en los logs.
  raise exception 'registro_cerrado'
    using errcode = 'P0001', hint = 'El registro está cerrado y este email no está en registro_permitidos.';
end $$;

create trigger kapital_validar_registro before insert on auth.users
  for each row execute function validar_registro();

-- Después de crear el usuario: su perfil (Europe/Madrid, idioma es, sin onboarding).
create function crear_perfil_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger kapital_crear_perfil after insert on auth.users
  for each row execute function crear_perfil_usuario();


-- ---------------------------------------------------------------- Onboarding y bancos
-- Lee un saldo escrito por el usuario ("1.258,50", "0", "38,5 €"). Más estricto
-- que leer_importe: rechaza letras, signos y textos vacíos en vez de adivinar.
create function leer_saldo(p text) returns numeric
language plpgsql immutable set search_path = public as $$
declare
  s text := btrim(replace(coalesce(p, ''), '€', ''));
  v numeric;
begin
  if s !~ '^[0-9][0-9.,]*$' then
    raise exception 'Saldo no válido: «%». Escribe un importe positivo, por ejemplo 1.258,50', coalesce(p, '')
      using errcode = '22023';
  end if;
  v := leer_importe(s);
  if v is null then
    raise exception 'Saldo no válido: «%». Escribe un importe positivo, por ejemplo 1.258,50', p
      using errcode = '22023';
  end if;
  return v;
end $$;

-- Primer inicio de sesión. p_bancos: 1–5 objetos
--   { "entidad": string|null, "nombre": string, "color": string|null, "saldo": string }
-- El primero es la cuenta principal. Los saldos son saldo_inicial con fecha de hoy.
create function completar_onboarding(p_idioma text, p_bancos jsonb, p_efectivo text) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_hoy        date;
  v_hecho      boolean;
  v_banco      jsonb;
  v_entidad    text;
  v_nombre     text;
  v_color      text;
  v_saldo      numeric;
  v_efectivo   numeric;
  v_orden      int := 0;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;

  insert into perfiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select p.onboarding_completado into v_hecho from perfiles p where p.user_id = v_uid for update;
  if v_hecho then
    raise exception 'El onboarding ya está completado' using errcode = 'P0001';
  end if;

  if p_idioma is null or p_idioma not in ('es', 'en', 'ca') then
    raise exception 'Idioma no válido: %', coalesce(p_idioma, '(vacío)') using errcode = '22023';
  end if;
  if p_bancos is null or jsonb_typeof(p_bancos) <> 'array'
     or jsonb_array_length(p_bancos) not between 1 and 5 then
    raise exception 'Indica entre 1 y 5 bancos' using errcode = '22023';
  end if;
  v_efectivo := leer_saldo(p_efectivo);

  -- El idioma va primero: hoy_usuario() y los textos ya usan el perfil.
  update perfiles set idioma = p_idioma where user_id = v_uid;
  v_hoy := hoy_usuario();

  for v_banco in select e from jsonb_array_elements(p_bancos) e loop
    if jsonb_typeof(v_banco) <> 'object' then
      raise exception 'Cada banco debe ser un objeto con entidad, nombre, color y saldo' using errcode = '22023';
    end if;
    v_entidad := nullif(btrim(coalesce(v_banco ->> 'entidad', '')), '');
    if v_entidad is not null and nombre_entidad(v_entidad) is null then
      raise exception 'Banco no reconocido: %', v_entidad using errcode = '22023';
    end if;
    v_nombre := coalesce(nullif(btrim(coalesce(v_banco ->> 'nombre', '')), ''), nombre_entidad(v_entidad));
    if v_nombre is null then
      raise exception 'Escribe el nombre del banco' using errcode = '22023';
    end if;
    v_color := nullif(btrim(coalesce(v_banco ->> 'color', '')), '');
    v_saldo := leer_saldo(v_banco ->> 'saldo');
    v_orden := v_orden + 1;

    begin
      insert into cuentas (user_id, nombre, tipo, entidad, color, saldo_inicial, fecha_inicial, es_principal, orden)
      values (v_uid, v_nombre, 'banco', v_entidad, v_color, v_saldo, v_hoy, v_orden = 1, v_orden);
    exception when unique_violation then
      raise exception 'Ya tienes una cuenta llamada «%»', v_nombre using errcode = '23505';
    end;
  end loop;

  begin
    insert into cuentas (user_id, nombre, tipo, saldo_inicial, fecha_inicial, orden)
    values (v_uid, 'Efectivo', 'efectivo', v_efectivo, v_hoy, v_orden + 1);
  exception when unique_violation then
    raise exception 'Ya tienes una cuenta llamada «Efectivo»' using errcode = '23505';
  end;

  -- Mismas categorías que preparar_usuario (lo comprueba tests/db/onboarding.test.ts).
  insert into categorias (user_id, nombre, tipo, color, icono, orden) values
    (v_uid, 'Restaurantes',   'gasto',   '#ff8a3d', '🍽️', 1),
    (v_uid, 'Ocio',           'gasto',   '#9b6bff', '🎉', 2),
    (v_uid, 'Transporte',     'gasto',   '#3b82ff', '🚗', 3),
    (v_uid, 'Suscripciones',  'gasto',   '#ff5fa8', '🔁', 4),
    (v_uid, 'Otros gastos',   'gasto',   '#8f9bbd', '🛍️', 5),
    (v_uid, 'Nómina',         'ingreso', '#2fd27f', '💼', 6),
    (v_uid, 'Otros ingresos', 'ingreso', '#2fd27f', '💰', 7),
    (v_uid, 'Rendimientos',   'ingreso', '#14b8a6', '📊', 8)
  on conflict (user_id, nombre) do nothing;

  update perfiles set onboarding_completado = true where user_id = v_uid;
end $$;

-- Añadir un banco desde Configuración (siempre con saldo, con fecha de hoy).
-- Es la cuenta principal si el usuario no tiene ninguna abierta.
create function crear_banco(p_entidad text, p_nombre text, p_color text, p_saldo text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_entidad  text := nullif(btrim(coalesce(p_entidad, '')), '');
  v_nombre   text;
  v_saldo    numeric;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;
  if v_entidad is not null and nombre_entidad(v_entidad) is null then
    raise exception 'Banco no reconocido: %', v_entidad using errcode = '22023';
  end if;
  v_nombre := coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), nombre_entidad(v_entidad));
  if v_nombre is null then
    raise exception 'Escribe el nombre del banco' using errcode = '22023';
  end if;
  v_saldo := leer_saldo(p_saldo);

  begin
    insert into cuentas (user_id, nombre, tipo, entidad, color, saldo_inicial, fecha_inicial, es_principal, orden)
    values (
      v_uid, v_nombre, 'banco', v_entidad, nullif(btrim(coalesce(p_color, '')), ''), v_saldo, hoy_usuario(),
      not exists (select 1 from cuentas c where c.user_id = v_uid and c.es_principal),
      coalesce((select max(c.orden) from cuentas c where c.user_id = v_uid), 0) + 1)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya tienes una cuenta llamada «%»', v_nombre using errcode = '23505';
  end;
  return v_id;
end $$;


-- ---------------------------------------------------------------- Análisis mensual
-- Una fila por usuario y mes. La escribe solo la Edge Function (service_role).
create table analisis_mensuales (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  mes             date not null check (extract(day from mes) = 1),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'generando', 'listo', 'error')),
  mes_incompleto  boolean not null default false,
  datos           jsonb,
  contenido       jsonb,
  idioma          text not null default 'es' check (idioma in ('es', 'en', 'ca')),
  modelo          text,
  regeneraciones  int not null default 0 check (regeneraciones between 0 and 1),
  intentos        int not null default 0 check (intentos >= 0),
  error_codigo    text,
  generado_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, mes)
);

create function tocar_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger analisis_mensuales_updated_at before update on analisis_mensuales
  for each row execute function tocar_updated_at();

alter table analisis_mensuales enable row level security;
create policy leer_mis_analisis on analisis_mensuales for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on analisis_mensuales from anon;
revoke all on analisis_mensuales from authenticated;
grant select on analisis_mensuales to authenticated;

-- Agregados del mes del usuario actual para el análisis. Importes como texto
-- (nunca números JSON) para no perder exactitud.
--   · resumen: [día 1, último día del mes] (sección 3). Un mes en curso es «hasta hoy».
--   · variacion: patrimonio al cierre de D1 = último día del mes anterior y de
--     D2 = último día del mes, o HOY si el mes está en curso (secciones 5 y 7:
--     no hay valores de días futuros; el de hoy es provisional).
--   · mes_incompleto: la cuenta más antigua empieza después del día 1 (o no hay cuentas).
-- Todas las consultas filtran por auth.uid() explícitamente: también se llama
-- desde datos_analisis_usuario (security definer, sin RLS).
create function datos_analisis(p_mes date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_mes      date;
  v_fin      date;
  v_ant      date;
  v_ant_fin  date;
  v_hoy      date;
  v_inicio   date;
  v_idioma   text;
  v_balance  numeric;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'Indica el mes' using errcode = '22023';
  end if;

  v_mes     := date_trunc('month', p_mes)::date;
  v_fin     := (v_mes + interval '1 month - 1 day')::date;
  v_ant     := (v_mes - interval '1 month')::date;
  v_ant_fin := v_mes - 1;
  v_hoy     := hoy_usuario();
  if v_mes > v_hoy then
    raise exception 'El mes % todavía no ha empezado', to_char(v_mes, 'YYYY-MM') using errcode = '22023';
  end if;

  select p.idioma into v_idioma from perfiles p where p.user_id = v_uid;
  select min(c.fecha_inicial) into v_inicio from cuentas c where c.user_id = v_uid;
  select r.balance into v_balance from resumen_periodo(v_mes, v_fin) r;

  return jsonb_build_object(
    'mes',            to_char(v_mes, 'YYYY-MM-DD'),
    'mes_incompleto', coalesce(v_inicio > v_mes, true),
    'idioma',         coalesce(v_idioma, 'es'),

    'resumen', (
      select jsonb_build_object(
        'ingresos', r.ingresos::text, 'gastos', r.gastos::text, 'devoluciones', r.devoluciones::text,
        'gastos_netos', r.gastos_netos::text, 'balance', r.balance::text,
        'ahorro_pct', r.ahorro_pct::text, 'ajustes', r.ajustes::text)
      from resumen_periodo(v_mes, v_fin) r),

    'resumen_mes_anterior', (
      select jsonb_build_object(
        'ingresos', r.ingresos::text, 'gastos', r.gastos::text, 'devoluciones', r.devoluciones::text,
        'gastos_netos', r.gastos_netos::text, 'balance', r.balance::text,
        'ahorro_pct', r.ahorro_pct::text, 'ajustes', r.ajustes::text)
      from resumen_periodo(v_ant, v_ant_fin) r),

    'categorias', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', g.nombre, 'color', g.color, 'gasto', g.gasto::text)
               order by g.gasto desc, g.nombre), '[]'::jsonb)
      from gasto_por_categoria(v_mes, v_fin) g),

    'categorias_mes_anterior', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', g.nombre, 'color', g.color, 'gasto', g.gasto::text)
               order by g.gasto desc, g.nombre), '[]'::jsonb)
      from gasto_por_categoria(v_ant, v_ant_fin) g),

    'metodos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('metodo', g.metodo::text, 'gasto', g.gasto::text)
               order by g.gasto desc, g.metodo::text), '[]'::jsonb)
      from gasto_por_metodo(v_mes, v_fin) g),

    'variacion', (
      select jsonb_build_object(
        'patrimonio_inicial', v.patrimonio_inicial::text, 'patrimonio_final', v.patrimonio_final::text,
        'balance', v.balance::text, 'revalorizacion', v.revalorizacion::text, 'ajustes', v.ajustes::text,
        'saldos_iniciales', v.saldos_iniciales::text, 'variacion', v.variacion::text)
      from variacion_patrimonial(v_mes - 1, least(v_fin, v_hoy)) v),

    'objetivos', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'tipo', o.tipo::text,
                 'categoria', c.nombre,
                 'importe', o.importe::text,
                 'actual', case when o.tipo = 'ahorro_mensual' then v_balance::text
                                else coalesce(g.gasto, 0.00)::text end)
               order by o.tipo, c.nombre), '[]'::jsonb)
      from objetivos o
      left join categorias c on c.id = o.categoria_id and c.user_id = o.user_id
      left join gasto_por_categoria(v_mes, v_fin) g on g.categoria_id = o.categoria_id
      where o.user_id = v_uid and o.activo)
  );
end $$;

-- Lo mismo para un usuario concreto. Solo para la Edge Function (service_role).
-- Fija el usuario de la sesión (las dos formas que lee auth.uid()) solo dentro
-- de esta transacción y lo restaura al terminar.
create function datos_analisis_usuario(p_user uuid, p_mes date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub     text := current_setting('request.jwt.claim.sub', true);
  v_claims  text := current_setting('request.jwt.claims', true);
  v_datos   jsonb;
begin
  if p_user is null or not exists (select 1 from perfiles p where p.user_id = p_user) then
    raise exception 'Usuario no encontrado' using errcode = '22023';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text)::text, true);
  v_datos := datos_analisis(p_mes);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  return v_datos;
end $$;

-- El usuario pide rehacer su análisis de un mes: una sola vez, y solo si ya
-- terminó (listo o error). Se reinician los intentos para que la Edge Function
-- pueda volver a procesarlo.
create function solicitar_regeneracion(p_mes date) returns void
language plpgsql security definer set search_path = public as $$
begin
  update analisis_mensuales a
     set estado = 'pendiente',
         regeneraciones = a.regeneraciones + 1,
         intentos = 0,
         error_codigo = null
   where a.user_id = auth.uid()
     and a.mes = date_trunc('month', p_mes)::date
     and a.estado in ('listo', 'error')
     and a.regeneraciones < 1;
  if not found then
    raise exception 'limite_regeneracion' using errcode = 'P0001';
  end if;
end $$;


-- ---------------------------------------------------------------- Permisos de funciones
revoke execute on function
  nombre_entidad(text),
  validar_limite_bancos(),
  validar_registro(),
  crear_perfil_usuario(),
  leer_saldo(text),
  completar_onboarding(text, jsonb, text),
  crear_banco(text, text, text, text),
  tocar_updated_at(),
  datos_analisis(date),
  datos_analisis_usuario(uuid, date),
  solicitar_regeneracion(date)
from public, anon, authenticated;

grant execute on function
  nombre_entidad(text),
  leer_saldo(text),
  completar_onboarding(text, jsonb, text),
  crear_banco(text, text, text, text),
  datos_analisis(date),
  solicitar_regeneracion(date)
to authenticated;

-- datos_analisis_usuario: solo la Edge Function.
grant execute on function datos_analisis_usuario(uuid, date) to service_role;
