-- Rollback de 20261102000000_eliminar_categorias.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
--
-- 1. Vuelve a admitir las claves hogar, salud, cuidado_personal y regalos.
-- 2. Recrea las categorías desde respaldo_20261102_categorias con todos sus
--    datos (id, nombre, clave, tipo, color, icono, orden, archivada,
--    created_at). Si el usuario ha creado entretanto otra categoría con el
--    mismo nombre, el rollback se aborta con un mensaje claro (el nombre es
--    único por usuario): hay que renombrarla antes.
-- 3. Devuelve cada movimiento a su categoría original desde
--    respaldo_20261102_movimientos_categoria. Solo los que siguen en la
--    categoría a la que los movió la migración: si el usuario los cambió
--    después a mano, se respeta su cambio. Como en la migración, el trigger
--    movimientos_cuenta_cerrada se desactiva solo durante ese UPDATE (cambiar
--    la categoría no cambia ningún saldo) y el cambio es transaccional.
-- 4. traduccion_categoria, preparar_usuario y completar_onboarding vuelven a
--    sus versiones de 20261024000002_analisis_config.sql y
--    20261027000000_colores_categorias.sql (create or replace conserva los
--    permisos).
-- 5. Borra las tablas de respaldo.


-- ---------------------------------------------------------------- 1. Claves válidas
alter table categorias drop constraint categorias_clave_valida;
alter table categorias
  add constraint categorias_clave_valida check (clave in (
    'restaurantes', 'ocio', 'transporte', 'suscripciones', 'otros_gastos',
    'nomina', 'otros_ingresos', 'rendimientos',
    'supermercado', 'hogar', 'salud', 'deporte', 'cuidado_personal', 'ropa', 'regalos'));


-- ---------------------------------------------------------------- 2. Categorías
do $$
declare v_choques int;
begin
  select count(*) into v_choques
  from respaldo_20261102_categorias r
  join categorias c on c.user_id = r.user_id and (c.nombre = r.nombre or c.clave = r.clave);
  if v_choques > 0 then
    raise exception 'Hay % categoría(s) con el mismo nombre que Hogar, Salud, Cuidado personal o Regalos '
                    '(creadas después de eliminarlas). Renómbralas antes de deshacer la migración.', v_choques
      using errcode = 'P0001';
  end if;
end $$;

-- limpiar_clave_categoria solo actúa en UPDATE: el INSERT conserva la clave.
insert into categorias (id, user_id, nombre, tipo, color, icono, orden, archivada, created_at, clave)
  select r.id, r.user_id, r.nombre, r.tipo, r.color, r.icono, r.orden, r.archivada, r.created_at, r.clave
  from respaldo_20261102_categorias r;


-- ---------------------------------------------------------------- 3. Movimientos
alter table movimientos disable trigger movimientos_cuenta_cerrada;

update movimientos m
   set categoria_id = r.categoria_id_original
  from respaldo_20261102_movimientos_categoria r
 where m.id = r.movimiento_id
   and m.user_id = r.user_id
   and m.categoria_id = r.categoria_id_nueva;

alter table movimientos enable trigger movimientos_cuenta_cerrada;


-- ---------------------------------------------------------------- 4. Funciones
-- Versión de 20261024000002_analisis_config.sql.
create or replace function traduccion_categoria(p_clave text, p_idioma text) returns text
language sql immutable set search_path = public as $$
  select t.nombre
  from (values
    ('restaurantes',   'es', 'Restaurantes'),   ('restaurantes',   'en', 'Restaurants'),        ('restaurantes',   'ca', 'Restaurants'),
    ('ocio',           'es', 'Ocio'),           ('ocio',           'en', 'Leisure'),            ('ocio',           'ca', 'Oci'),
    ('transporte',     'es', 'Transporte'),     ('transporte',     'en', 'Transport'),          ('transporte',     'ca', 'Transport'),
    ('suscripciones',  'es', 'Suscripciones'),  ('suscripciones',  'en', 'Subscriptions'),      ('suscripciones',  'ca', 'Subscripcions'),
    -- Categorías por defecto de 20261024000000_categorias_y_cuentas_clave.sql
    ('supermercado', 'es', 'Supermercado'), ('supermercado', 'en', 'Groceries'), ('supermercado', 'ca', 'Supermercat'),
    ('hogar', 'es', 'Hogar'), ('hogar', 'en', 'Home'), ('hogar', 'ca', 'Llar'),
    ('salud', 'es', 'Salud'), ('salud', 'en', 'Health'), ('salud', 'ca', 'Salut'),
    ('deporte', 'es', 'Deporte'), ('deporte', 'en', 'Sport'), ('deporte', 'ca', 'Esport'),
    ('cuidado_personal', 'es', 'Cuidado personal'), ('cuidado_personal', 'en', 'Personal care'), ('cuidado_personal', 'ca', 'Cura personal'),
    ('ropa', 'es', 'Ropa'), ('ropa', 'en', 'Clothing'), ('ropa', 'ca', 'Roba'),
    ('regalos', 'es', 'Regalos'), ('regalos', 'en', 'Gifts'), ('regalos', 'ca', 'Regals'),
    ('otros_gastos',   'es', 'Otros gastos'),   ('otros_gastos',   'en', 'Other expenses'),     ('otros_gastos',   'ca', 'Altres despeses'),
    ('nomina',         'es', 'Nómina'),         ('nomina',         'en', 'Salary'),             ('nomina',         'ca', 'Nòmina'),
    ('otros_ingresos', 'es', 'Otros ingresos'), ('otros_ingresos', 'en', 'Other income'),       ('otros_ingresos', 'ca', 'Altres ingressos'),
    ('rendimientos',   'es', 'Rendimientos'),   ('rendimientos',   'en', 'Investment returns'), ('rendimientos',   'ca', 'Rendiments')
  ) as t (clave, idioma, nombre)
  where t.clave = p_clave and t.idioma = p_idioma
$$;

-- Versiones de 20261027000000_colores_categorias.sql.
create or replace function preparar_usuario(p_email text, p_dispositivo text default 'iPhone') returns text
language plpgsql security definer set search_path = public as $$
declare u uuid; t text;
begin
  select id into u from auth.users where lower(email) = lower(btrim(p_email));
  if u is null then
    raise exception 'No hay ningún usuario con el email %. Créalo antes en Authentication → Users.', p_email;
  end if;

  insert into perfiles (user_id) values (u) on conflict (user_id) do nothing;

  insert into cuentas (user_id, nombre, clave, tipo, emoji, saldo_inicial, es_principal, orden) values
    (u, 'BBVA',           null,       'banco',     '🏦', 0, true,  1),
    (u, 'Efectivo',       'efectivo', 'efectivo',  '💵', 0, false, 2),
    (u, 'Trade Republic', null,       'inversion', '📈', 0, false, 3)
  on conflict (user_id, nombre) do nothing;

  insert into categorias (user_id, nombre, clave, tipo, color, icono, orden) values
    (u, 'Restaurantes',   'restaurantes',   'gasto',   '#ff8a3d', '🍽️', 1),
    (u, 'Ocio',           'ocio',           'gasto',   '#9b6bff', '🎉', 2),
    (u, 'Transporte',     'transporte',     'gasto',   '#3b82ff', '🚗', 3),
    (u, 'Suscripciones',  'suscripciones',  'gasto',   '#ff5fa8', '🔁', 4),
    (u, 'Supermercado',     'supermercado',     'gasto',   '#84cc16', '🛒', 5),
    (u, 'Hogar',            'hogar',            'gasto',   '#f2c46d', '🏠', 6),
    (u, 'Salud',            'salud',            'gasto',   '#ef4444', '🩺', 7),
    (u, 'Deporte',          'deporte',          'gasto',   '#06b6d4', '🏃', 8),
    (u, 'Cuidado personal', 'cuidado_personal', 'gasto',   '#d946ef', '💇', 9),
    (u, 'Ropa',             'ropa',             'gasto',   '#c2885a', '👕', 10),
    (u, 'Regalos',          'regalos',          'gasto',   '#2dd4bf', '🎁', 11),
    (u, 'Otros gastos',   'otros_gastos',   'gasto',   '#8f9bbd', '🛍️', 12),
    (u, 'Nómina',         'nomina',         'ingreso', '#2fd27f', '💼', 13),
    (u, 'Otros ingresos', 'otros_ingresos', 'ingreso', '#2fd27f', '💰', 14),
    (u, 'Rendimientos',   'rendimientos',   'ingreso', '#14b8a6', '📊', 15)
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
    insert into cuentas (user_id, nombre, clave, tipo, saldo_inicial, fecha_inicial, orden)
    values (v_uid, 'Efectivo', 'efectivo', 'efectivo', v_efectivo, v_hoy, v_orden + 1);
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
    (v_uid, 'Supermercado',     'supermercado',     'gasto',   '#84cc16', '🛒', 5),
    (v_uid, 'Hogar',            'hogar',            'gasto',   '#f2c46d', '🏠', 6),
    (v_uid, 'Salud',            'salud',            'gasto',   '#ef4444', '🩺', 7),
    (v_uid, 'Deporte',          'deporte',          'gasto',   '#06b6d4', '🏃', 8),
    (v_uid, 'Cuidado personal', 'cuidado_personal', 'gasto',   '#d946ef', '💇', 9),
    (v_uid, 'Ropa',             'ropa',             'gasto',   '#c2885a', '👕', 10),
    (v_uid, 'Regalos',          'regalos',          'gasto',   '#2dd4bf', '🎁', 11),
    (v_uid, 'Otros gastos',   'otros_gastos',   'gasto',   '#8f9bbd', '🛍️', 12),
    (v_uid, 'Nómina',         'nomina',         'ingreso', '#2fd27f', '💼', 13),
    (v_uid, 'Otros ingresos', 'otros_ingresos', 'ingreso', '#2fd27f', '💰', 14),
    (v_uid, 'Rendimientos',   'rendimientos',   'ingreso', '#14b8a6', '📊', 15)
  on conflict (user_id, nombre) do nothing;

  -- Permiso de un solo uso, local a la transacción y ligado a este usuario.
  perform set_config('kapital.completando_onboarding', v_uid::text, true);
  update perfiles set onboarding_completado = true where user_id = v_uid;
  perform set_config('kapital.completando_onboarding', '', true);
end $$;


-- ---------------------------------------------------------------- 5. Respaldo
drop table respaldo_20261102_movimientos_categoria;
drop table respaldo_20261102_categorias;
