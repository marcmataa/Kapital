-- =====================================================================
--  Kapital · Se eliminan las categorías de gasto por defecto «Hogar»,
--  «Salud», «Cuidado personal» y «Regalos»
--
--  Rollback: supabase/rollback/20261102000000_eliminar_categorias.down.sql
--  Tests:    tests/db/eliminar-categorias.test.ts (+ onboarding, atajo,
--            categorias-clave, analisis-config, seguridad)
--
--  Las categorías se identifican por su `clave` (hogar, salud,
--  cuidado_personal, regalos). Una categoría que el usuario creó o renombró
--  no tiene clave y NO se toca, aunque se llame «Hogar».
--
--  0. Comprobaciones. La migración se aborta, sin cambiar nada, si:
--       · algún objetivo usa una de esas categorías. objetivos.categoria_id
--         tiene `on delete cascade`: borrar la categoría borraría el objetivo
--         sin avisar. Lo decide el usuario (borrarlo o cambiarlo) antes.
--       · algún usuario tiene movimientos en esas categorías y no tiene la
--         categoría de gasto «Otros gastos» (clave otros_gastos) activa. No se
--         inventa una categoría de destino.
--  1. Respaldo, antes de tocar nada: respaldo_20261102_categorias (las filas
--     completas de las categorías) y respaldo_20261102_movimientos_categoria
--     (id del movimiento, categoría original y la nueva). Con RLS activa, sin
--     políticas y sin permisos para anon ni authenticated: no salen en la
--     API. Las usa el rollback, que las borra al final.
--  2. Todos sus movimientos (gastos y devoluciones) pasan a «Otros gastos» del
--     MISMO usuario. Ni el importe, ni la fecha, ni el tipo, ni las cuentas
--     cambian: los totales del mes (gastos, devoluciones, gastos netos y
--     balance) y el patrimonio son los mismos (lo comprueba el test).
--     Triggers de movimientos:
--       · movimientos_validar (validar_movimiento) se ejecuta: comprueba que
--         «Otros gastos» es de gasto y las demás reglas, que no cambian.
--       · movimientos_cuenta_cerrada (proteger_cuenta_cerrada) se desactiva
--         SOLO durante el UPDATE de este paso. Impide cambiar movimientos de
--         cuentas cerradas porque haría aparecer o desaparecer dinero; cambiar
--         la categoría no cambia ningún saldo, así que la recategorización
--         también llega a esas cuentas. `alter table … disable trigger` es
--         transaccional: si la migración falla, el trigger sigue activo.
--  3. Se borran las 4 categorías (también las archivadas). No hay ningún
--     trigger de borrado en categorias (los de Rendimientos y de la clave son
--     BEFORE UPDATE); ningún movimiento ni objetivo las referencia ya. El
--     `orden` de las demás no se compacta: el orden relativo no cambia y el
--     rollback las devuelve a su sitio exacto.
--  4. categorias_clave_valida deja de admitir esas 4 claves.
--  5. traduccion_categoria: sin esas 4 claves (ninguna categoría las tiene ya).
--     Misma firma: `create or replace` conserva los permisos.
--  6. preparar_usuario y completar_onboarding: iguales que en
--     20261027000000_colores_categorias.sql, sin esas 4 categorías (11 por
--     defecto, orden 1-11). `create or replace` conserva los permisos.
-- =====================================================================


-- ---------------------------------------------------------------- 0. Comprobaciones
do $$
declare
  v_objetivos int;
  v_usuarios  int;
begin
  select count(*) into v_objetivos
  from objetivos o
  join categorias c on c.id = o.categoria_id and c.user_id = o.user_id
  where c.clave in ('hogar', 'salud', 'cuidado_personal', 'regalos');
  if v_objetivos > 0 then
    raise exception 'Hay % objetivo(s) con las categorías Hogar, Salud, Cuidado personal o Regalos. '
                    'Bórralos o cámbialos de categoría antes de aplicar esta migración '
                    '(borrar la categoría los borraría en cascada).', v_objetivos
      using errcode = 'P0001';
  end if;

  select count(distinct m.user_id) into v_usuarios
  from movimientos m
  join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
  where c.clave in ('hogar', 'salud', 'cuidado_personal', 'regalos')
    and not exists (
      select 1 from categorias o
      where o.user_id = m.user_id and o.clave = 'otros_gastos' and o.tipo = 'gasto' and not o.archivada);
  if v_usuarios > 0 then
    raise exception '% usuario(s) tienen movimientos en Hogar, Salud, Cuidado personal o Regalos y no tienen '
                    'la categoría «Otros gastos» (clave otros_gastos) activa: no hay adónde moverlos.', v_usuarios
      using errcode = 'P0001';
  end if;
end $$;


-- ---------------------------------------------------------------- 1. Respaldo
create table respaldo_20261102_categorias as
  select c.* from categorias c
  where c.clave in ('hogar', 'salud', 'cuidado_personal', 'regalos');
alter table respaldo_20261102_categorias add primary key (id);

create table respaldo_20261102_movimientos_categoria as
  select m.id           as movimiento_id,
         m.user_id,
         m.categoria_id as categoria_id_original,
         o.id           as categoria_id_nueva
  from movimientos m
  join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
  join categorias o on o.user_id = m.user_id and o.clave = 'otros_gastos'
  where c.clave in ('hogar', 'salud', 'cuidado_personal', 'regalos');
alter table respaldo_20261102_movimientos_categoria add primary key (movimiento_id);

-- Fuera de la API: RLS sin políticas y sin permisos (Supabase los concede por
-- defecto a anon y authenticated sobre toda tabla nueva de public).
alter table respaldo_20261102_categorias enable row level security;
alter table respaldo_20261102_movimientos_categoria enable row level security;
revoke all on table respaldo_20261102_categorias, respaldo_20261102_movimientos_categoria
  from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------- 2. Movimientos a «Otros gastos»
alter table movimientos disable trigger movimientos_cuenta_cerrada;

update movimientos m
   set categoria_id = r.categoria_id_nueva
  from respaldo_20261102_movimientos_categoria r
 where m.id = r.movimiento_id;

alter table movimientos enable trigger movimientos_cuenta_cerrada;


-- ---------------------------------------------------------------- 3. Borrado de las categorías
delete from categorias where clave in ('hogar', 'salud', 'cuidado_personal', 'regalos');


-- ---------------------------------------------------------------- 4. Claves válidas
alter table categorias drop constraint categorias_clave_valida;
alter table categorias
  add constraint categorias_clave_valida check (clave in (
    'restaurantes', 'ocio', 'transporte', 'suscripciones', 'otros_gastos',
    'nomina', 'otros_ingresos', 'rendimientos',
    'supermercado', 'deporte', 'ropa'));


-- ---------------------------------------------------------------- 5. Traducciones
-- Igual que en 20261024000002_analisis_config.sql, sin las 4 claves.
-- Mismos textos que apps/web/src/shared/i18n/common/*.ts.
create or replace function traduccion_categoria(p_clave text, p_idioma text) returns text
language sql immutable set search_path = public as $$
  select t.nombre
  from (values
    ('restaurantes',   'es', 'Restaurantes'),   ('restaurantes',   'en', 'Restaurants'),        ('restaurantes',   'ca', 'Restaurants'),
    ('ocio',           'es', 'Ocio'),           ('ocio',           'en', 'Leisure'),            ('ocio',           'ca', 'Oci'),
    ('transporte',     'es', 'Transporte'),     ('transporte',     'en', 'Transport'),          ('transporte',     'ca', 'Transport'),
    ('suscripciones',  'es', 'Suscripciones'),  ('suscripciones',  'en', 'Subscriptions'),      ('suscripciones',  'ca', 'Subscripcions'),
    ('supermercado',   'es', 'Supermercado'),   ('supermercado',   'en', 'Groceries'),          ('supermercado',   'ca', 'Supermercat'),
    ('deporte',        'es', 'Deporte'),        ('deporte',        'en', 'Sport'),              ('deporte',        'ca', 'Esport'),
    ('ropa',           'es', 'Ropa'),           ('ropa',           'en', 'Clothing'),           ('ropa',           'ca', 'Roba'),
    ('otros_gastos',   'es', 'Otros gastos'),   ('otros_gastos',   'en', 'Other expenses'),     ('otros_gastos',   'ca', 'Altres despeses'),
    ('nomina',         'es', 'Nómina'),         ('nomina',         'en', 'Salary'),             ('nomina',         'ca', 'Nòmina'),
    ('otros_ingresos', 'es', 'Otros ingresos'), ('otros_ingresos', 'en', 'Other income'),       ('otros_ingresos', 'ca', 'Altres ingressos'),
    ('rendimientos',   'es', 'Rendimientos'),   ('rendimientos',   'en', 'Investment returns'), ('rendimientos',   'ca', 'Rendiments')
  ) as t (clave, idioma, nombre)
  where t.clave = p_clave and t.idioma = p_idioma
$$;


-- ---------------------------------------------------------------- 6. Onboarding
-- Iguales que en 20261027000000_colores_categorias.sql, sin las 4 categorías.
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
    (u, 'Supermercado',   'supermercado',   'gasto',   '#84cc16', '🛒', 5),
    (u, 'Deporte',        'deporte',        'gasto',   '#06b6d4', '🏃', 6),
    (u, 'Ropa',           'ropa',           'gasto',   '#c2885a', '👕', 7),
    (u, 'Otros gastos',   'otros_gastos',   'gasto',   '#8f9bbd', '🛍️', 8),
    (u, 'Nómina',         'nomina',         'ingreso', '#2fd27f', '💼', 9),
    (u, 'Otros ingresos', 'otros_ingresos', 'ingreso', '#2fd27f', '💰', 10),
    (u, 'Rendimientos',   'rendimientos',   'ingreso', '#14b8a6', '📊', 11)
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
    (v_uid, 'Supermercado',   'supermercado',   'gasto',   '#84cc16', '🛒', 5),
    (v_uid, 'Deporte',        'deporte',        'gasto',   '#06b6d4', '🏃', 6),
    (v_uid, 'Ropa',           'ropa',           'gasto',   '#c2885a', '👕', 7),
    (v_uid, 'Otros gastos',   'otros_gastos',   'gasto',   '#8f9bbd', '🛍️', 8),
    (v_uid, 'Nómina',         'nomina',         'ingreso', '#2fd27f', '💼', 9),
    (v_uid, 'Otros ingresos', 'otros_ingresos', 'ingreso', '#2fd27f', '💰', 10),
    (v_uid, 'Rendimientos',   'rendimientos',   'ingreso', '#14b8a6', '📊', 11)
  on conflict (user_id, nombre) do nothing;

  -- Permiso de un solo uso, local a la transacción y ligado a este usuario.
  perform set_config('kapital.completando_onboarding', v_uid::text, true);
  update perfiles set onboarding_completado = true where user_id = v_uid;
  perform set_config('kapital.completando_onboarding', '', true);
end $$;
