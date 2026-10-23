-- =====================================================================
--  Kapital · Clave de las categorías por defecto (nombres traducidos)
--
--  Rollback: supabase/rollback/20261023000001_categorias_clave.down.sql
--  Tests:    tests/db/categorias-clave.test.ts (+ onboarding, seguridad)
--
--  Las categorías por defecto se crean con nombre en español. La app las
--  muestra traducidas (es / en / ca) a partir de `clave`; las categorías que
--  crea o renombra el usuario tienen `clave` null y se muestran tal cual.
--
--  `nombre` no cambia: sigue siendo el nombre canónico en español, que es lo
--  que usan el atajo («Rendimientos», el campo categoría del atajo), el
--  análisis mensual y la unicidad (user_id, nombre).
--
--  1. Columna `clave` (check de valores permitidos, una por usuario).
--  2. Backfill: categorías por defecto con su nombre y tipo originales exactos.
--  3. Trigger: si cambia el nombre, la clave se pone a null (manda el nombre
--     del usuario). Ninguna actualización puede asignar una clave.
--  4. preparar_usuario y completar_onboarding crean las categorías con clave.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Columna
alter table categorias
  add column clave text
    constraint categorias_clave_valida check (clave in (
      'restaurantes', 'ocio', 'transporte', 'suscripciones', 'otros_gastos',
      'nomina', 'otros_ingresos', 'rendimientos'));

create unique index categorias_una_por_clave on categorias (user_id, clave) where clave is not null;


-- ---------------------------------------------------------------- 2. Backfill
-- Solo las que conservan el nombre y el tipo por defecto exactos: las
-- renombradas (o una «Ocio» de ingreso) se quedan sin clave y se ven tal cual.
update categorias c
   set clave = d.clave
  from (values
    ('Restaurantes',   'gasto'::tipo_categoria,   'restaurantes'),
    ('Ocio',           'gasto'::tipo_categoria,   'ocio'),
    ('Transporte',     'gasto'::tipo_categoria,   'transporte'),
    ('Suscripciones',  'gasto'::tipo_categoria,   'suscripciones'),
    ('Otros gastos',   'gasto'::tipo_categoria,   'otros_gastos'),
    ('Nómina',         'ingreso'::tipo_categoria, 'nomina'),
    ('Otros ingresos', 'ingreso'::tipo_categoria, 'otros_ingresos'),
    ('Rendimientos',   'ingreso'::tipo_categoria, 'rendimientos')
  ) as d (nombre, tipo, clave)
 where c.clave is null and c.nombre = d.nombre and c.tipo = d.tipo;


-- ---------------------------------------------------------------- 3. Trigger
-- En la base y no en el cliente: vale para cualquier cliente (web, SQL,
-- futuras apps) y la clave nunca puede seguir traduciendo un nombre que el
-- usuario ha cambiado. La web, además, envía `clave: null` cuando el usuario
-- cambia el nombre que ve (cubre escribir el nombre español original en en/ca).
create function limpiar_clave_categoria() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.clave is not null and new.clave is distinct from old.clave then
    raise exception 'La clave de una categoría no se puede asignar' using errcode = '23514';
  end if;
  if new.nombre is distinct from old.nombre then
    new.clave := null;
  end if;
  return new;
end $$;

create trigger categorias_limpiar_clave before update on categorias
  for each row execute function limpiar_clave_categoria();


-- ---------------------------------------------------------------- 4. Onboarding
-- Iguales que en 20261020000000_correcciones.sql, con la clave en las categorías.

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

  insert into categorias (user_id, nombre, clave, tipo, color, icono, orden) values
    (u, 'Restaurantes',   'restaurantes',   'gasto',   '#ff8a3d', '🍽️', 1),
    (u, 'Ocio',           'ocio',           'gasto',   '#9b6bff', '🎉', 2),
    (u, 'Transporte',     'transporte',     'gasto',   '#3b82ff', '🚗', 3),
    (u, 'Suscripciones',  'suscripciones',  'gasto',   '#ff5fa8', '🔁', 4),
    (u, 'Otros gastos',   'otros_gastos',   'gasto',   '#8f9bbd', '🛍️', 5),
    (u, 'Nómina',         'nomina',         'ingreso', '#2fd27f', '💼', 6),
    (u, 'Otros ingresos', 'otros_ingresos', 'ingreso', '#2fd27f', '💰', 7),
    (u, 'Rendimientos',   'rendimientos',   'ingreso', '#14b8a6', '📊', 8)
  on conflict (user_id, nombre) do nothing;

  update perfiles set onboarding_completado = true where user_id = u;

  t := 'mf_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into tokens_api (user_id, nombre, token_hash) values (u, p_dispositivo, encode(sha256(convert_to(t, 'UTF8')), 'hex'));
  return t;
end $$;

create or replace function completar_onboarding(p_idioma text, p_bancos jsonb, p_efectivo text) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_hoy          date;
  v_hecho        boolean;
  v_banco        jsonb;
  v_entidad      text;
  v_nombre       text;
  v_color        text;
  v_saldo        numeric;
  v_efectivo     numeric;
  v_orden        int := 0;
  v_restriccion  text;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;

  insert into perfiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select p.onboarding_completado into v_hecho from perfiles p where p.user_id = v_uid for update;
  if v_hecho or exists (select 1 from cuentas c where c.user_id = v_uid) then
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
      get stacked diagnostics v_restriccion = constraint_name;
      if v_restriccion = 'cuentas_user_id_nombre_key' then
        raise exception 'Ya tienes una cuenta llamada «%»', v_nombre using errcode = '23505';
      elsif v_restriccion = 'cuentas_una_principal' then
        raise exception 'Ya tienes una cuenta principal' using errcode = '23505';
      end if;
      raise;
    end;
  end loop;

  begin
    insert into cuentas (user_id, nombre, tipo, saldo_inicial, fecha_inicial, orden)
    values (v_uid, 'Efectivo', 'efectivo', v_efectivo, v_hoy, v_orden + 1);
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'cuentas_user_id_nombre_key' then
      raise exception 'Ya tienes una cuenta llamada «Efectivo»' using errcode = '23505';
    end if;
    raise;
  end;

  -- Mismas categorías que preparar_usuario (lo comprueba tests/db/onboarding.test.ts).
  insert into categorias (user_id, nombre, clave, tipo, color, icono, orden) values
    (v_uid, 'Restaurantes',   'restaurantes',   'gasto',   '#ff8a3d', '🍽️', 1),
    (v_uid, 'Ocio',           'ocio',           'gasto',   '#9b6bff', '🎉', 2),
    (v_uid, 'Transporte',     'transporte',     'gasto',   '#3b82ff', '🚗', 3),
    (v_uid, 'Suscripciones',  'suscripciones',  'gasto',   '#ff5fa8', '🔁', 4),
    (v_uid, 'Otros gastos',   'otros_gastos',   'gasto',   '#8f9bbd', '🛍️', 5),
    (v_uid, 'Nómina',         'nomina',         'ingreso', '#2fd27f', '💼', 6),
    (v_uid, 'Otros ingresos', 'otros_ingresos', 'ingreso', '#2fd27f', '💰', 7),
    (v_uid, 'Rendimientos',   'rendimientos',   'ingreso', '#14b8a6', '📊', 8)
  on conflict (user_id, nombre) do nothing;

  -- Permiso de un solo uso, local a la transacción y ligado a este usuario.
  perform set_config('kapital.completando_onboarding', v_uid::text, true);
  update perfiles set onboarding_completado = true where user_id = v_uid;
  perform set_config('kapital.completando_onboarding', '', true);
end $$;


-- ---------------------------------------------------------------- Permisos de funciones
-- Supabase concede EXECUTE a PUBLIC, anon y authenticated sobre toda función
-- nueva. La del trigger no la llama nadie directamente. `create or replace`
-- conserva los permisos de preparar_usuario y completar_onboarding.
revoke execute on function limpiar_clave_categoria() from public, anon, authenticated;
