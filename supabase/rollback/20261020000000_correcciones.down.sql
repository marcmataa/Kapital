-- Rollback de 20261020000000_correcciones.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso. Este va ANTES que
-- 20261019000000_onboarding_y_analisis.down.sql (restaura funciones que ese
-- script borra después).
--
-- ¡AVISO! Si después ejecutas también 20261019000000_onboarding_y_analisis.down.sql,
-- se borra el trigger de registro restringido y el registro queda ABIERTO a
-- cualquiera (si Auth permite altas). Lee el aviso de ese script antes.
--
-- Qué NO se deshace, a propósito:
--   · El backfill de perfiles.onboarding_completado (son datos ya correctos).
--   · Los permisos TRUNCATE / REFERENCES / TRIGGER retirados a anon y
--     authenticated (también los de tablas futuras): la app no los usa y
--     devolverlos reabriría un riesgo (TRUNCATE no pasa por RLS).
-- Sí se devuelve DELETE sobre perfiles a authenticated, como estaba.

drop function if exists reintentar_analisis(date);
drop function if exists ingresos_por_categoria(date, date);
drop function if exists gasto_por_dia(date, date);
drop function if exists hacer_principal(uuid);

drop trigger if exists categorias_proteger_rendimientos on categorias;
drop function if exists proteger_rendimientos();
alter table categorias drop constraint if exists categorias_nombre_longitud;

drop trigger if exists tokens_api_proteger_revocado on tokens_api;
drop function if exists proteger_token_revocado();

drop trigger if exists perfiles_proteger_onboarding on perfiles;
drop function if exists proteger_onboarding();
grant delete on perfiles to authenticated;

-- Versiones anteriores (create or replace conserva los permisos).

create or replace function preparar_usuario(p_email text, p_dispositivo text default 'iPhone') returns text
language plpgsql security definer set search_path = public as $$
declare u uuid; t text;
begin
  select id into u from auth.users where lower(email) = lower(btrim(p_email));
  if u is null then
    raise exception 'No hay ningún usuario con el email %. Créalo antes en Authentication → Users.', p_email;
  end if;

  insert into perfiles (user_id) values (u) on conflict (user_id) do nothing;

  insert into cuentas (user_id, nombre, tipo, emoji, saldo_inicial, es_principal, orden) values
    (u, 'BBVA',           'banco',     '🏦', 0, true,  1),
    (u, 'Efectivo',       'efectivo',  '💵', 0, false, 2),
    (u, 'Trade Republic', 'inversion', '📈', 0, false, 3)
  on conflict (user_id, nombre) do nothing;

  insert into categorias (user_id, nombre, tipo, color, icono, orden) values
    (u, 'Restaurantes',   'gasto',   '#ff8a3d', '🍽️', 1),
    (u, 'Ocio',           'gasto',   '#9b6bff', '🎉', 2),
    (u, 'Transporte',     'gasto',   '#3b82ff', '🚗', 3),
    (u, 'Suscripciones',  'gasto',   '#ff5fa8', '🔁', 4),
    (u, 'Otros gastos',   'gasto',   '#8f9bbd', '🛍️', 5),
    (u, 'Nómina',         'ingreso', '#2fd27f', '💼', 6),
    (u, 'Otros ingresos', 'ingreso', '#2fd27f', '💰', 7),
    (u, 'Rendimientos',   'ingreso', '#14b8a6', '📊', 8)
  on conflict (user_id, nombre) do nothing;

  t := 'mf_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into tokens_api (user_id, nombre, token_hash) values (u, p_dispositivo, encode(sha256(convert_to(t, 'UTF8')), 'hex'));
  return t;
end $$;

create or replace function completar_onboarding(p_idioma text, p_bancos jsonb, p_efectivo text) returns void
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

create or replace function datos_analisis(p_mes date) returns jsonb
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

create or replace function solicitar_regeneracion(p_mes date) returns void
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
