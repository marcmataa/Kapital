-- =====================================================================
--  Kapital · Categorías nuevas por defecto, clave de la cuenta de efectivo
--  y concepto por defecto del atajo en el idioma del usuario
--
--  Rollback: supabase/rollback/20261024000000_categorias_y_cuentas_clave.down.sql
--  Tests:    tests/db/categorias-cuentas-clave.test.ts (+ onboarding, atajo, seguridad)
--
--  1. Siete categorías de gasto por defecto más: Supermercado, Hogar, Salud,
--     Deporte, Cuidado personal, Ropa y Regalos (con clave, para mostrarlas
--     traducidas). Van antes de «Otros gastos».
--  2. Backfill: se añaden a los usuarios que ya tienen categorías, salvo las
--     que ya tengan con ese nombre. NO se recategoriza ningún movimiento.
--  3. `cuentas.clave`: la cuenta de efectivo por defecto («Efectivo») se
--     muestra traducida (es / en / ca). Mismo patrón que `categorias.clave`
--     (20261023000001_categorias_clave.sql): `nombre` sigue siendo el nombre
--     canónico en español, que es el que usa el atajo («desde»/«hacia»); si el
--     usuario la renombra, el trigger quita la clave y manda su nombre.
--  4. preparar_usuario y completar_onboarding: iguales que en
--     20261023000001_categorias_clave.sql, con las 7 categorías nuevas (las de
--     después pasan a orden 12-15) y la clave de la cuenta de efectivo.
--  5. registrar_movimiento: igual que en 20261015000000_esquema_inicial.sql,
--     salvo el concepto que pone la app cuando el atajo no envía ni concepto
--     ni comercio: antes initcap(tipo) («Devolucion», siempre en español);
--     ahora el nombre del tipo en el idioma del perfil. Los conceptos escritos
--     por el usuario no cambian.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Claves de categoría
alter table categorias drop constraint categorias_clave_valida;
alter table categorias
  add constraint categorias_clave_valida check (clave in (
    'restaurantes', 'ocio', 'transporte', 'suscripciones', 'otros_gastos',
    'nomina', 'otros_ingresos', 'rendimientos',
    'supermercado', 'hogar', 'salud', 'deporte', 'cuidado_personal', 'ropa', 'regalos'));


-- ---------------------------------------------------------------- 2. Backfill de categorías
-- Por usuario con categorías (los que aún no tienen ninguna las reciben en el
-- onboarding). Se saltan las que ya existen con ese nombre (sin distinguir
-- mayúsculas ni espacios, y sea del tipo que sea: el nombre es único por
-- usuario). Una «Ropa» creada por el usuario se queda como está, sin clave.
-- Las que faltan se colocan donde está «Otros gastos» (o al final si ya no la
-- tiene) y lo que había desde ahí se desplaza: el orden relativo no cambia.
do $$
declare
  v_user   uuid;
  v_base   int;
  v_faltan int;
begin
  for v_user in select distinct c.user_id from categorias c loop
    create temp table nuevas_categorias on commit drop as
      select n.nombre, n.clave, n.color, n.icono, n.pos
      from (values
        ('Supermercado',     'supermercado',     '#84cc16', '🛒', 1),
        ('Hogar',            'hogar',            '#f2c46d', '🏠', 2),
        ('Salud',            'salud',            '#ef4444', '🩺', 3),
        ('Deporte',          'deporte',          '#06b6d4', '🏃', 4),
        ('Cuidado personal', 'cuidado_personal', '#d946ef', '💇', 5),
        ('Ropa',             'ropa',             '#6366f1', '👕', 6),
        ('Regalos',          'regalos',          '#f43f5e', '🎁', 7)
      ) as n (nombre, clave, color, icono, pos)
      where not exists (
        select 1 from categorias c
        where c.user_id = v_user and lower(btrim(c.nombre)) = lower(n.nombre));

    select count(*) into v_faltan from nuevas_categorias;
    if v_faltan > 0 then
      select coalesce(
               (select c.orden from categorias c where c.user_id = v_user and c.clave = 'otros_gastos'),
               (select max(c.orden) + 1 from categorias c where c.user_id = v_user))
        into v_base;
      update categorias c set orden = c.orden + v_faltan where c.user_id = v_user and c.orden >= v_base;
      insert into categorias (user_id, nombre, clave, tipo, color, icono, orden)
        select v_user, n.nombre, n.clave, 'gasto', n.color, n.icono,
               v_base + (row_number() over (order by n.pos))::int - 1
        from nuevas_categorias n;
    end if;
    drop table nuevas_categorias;
  end loop;
end $$;


-- ---------------------------------------------------------------- 3. Clave de la cuenta de efectivo
alter table cuentas
  add column clave text
    constraint cuentas_clave_valida check (clave in ('efectivo')),
  add constraint cuentas_clave_tipo check (clave is null or tipo = 'efectivo');

create unique index cuentas_una_por_clave on cuentas (user_id, clave) where clave is not null;

-- La que conserva el nombre y el tipo del onboarding exactos (el nombre es
-- único por usuario: como mucho una). Una renombrada se queda sin clave.
update cuentas set clave = 'efectivo' where clave is null and tipo = 'efectivo' and nombre = 'Efectivo';

-- Como limpiar_clave_categoria: si cambia el nombre (o el tipo), manda lo que
-- ha escrito el usuario. Ninguna actualización puede asignar una clave.
create function limpiar_clave_cuenta() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.clave is not null and new.clave is distinct from old.clave then
    raise exception 'La clave de una cuenta no se puede asignar' using errcode = '23514';
  end if;
  if new.nombre is distinct from old.nombre or new.tipo is distinct from old.tipo then
    new.clave := null;
  end if;
  return new;
end $$;

create trigger cuentas_limpiar_clave before update on cuentas
  for each row execute function limpiar_clave_cuenta();


-- ---------------------------------------------------------------- 4. Onboarding
-- Iguales que en 20261023000001_categorias_clave.sql, con las categorías nuevas
-- y la clave de la cuenta de efectivo.

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
    (u, 'Ropa',             'ropa',             'gasto',   '#6366f1', '👕', 10),
    (u, 'Regalos',          'regalos',          'gasto',   '#f43f5e', '🎁', 11),
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
    (v_uid, 'Ropa',             'ropa',             'gasto',   '#6366f1', '👕', 10),
    (v_uid, 'Regalos',          'regalos',          'gasto',   '#f43f5e', '🎁', 11),
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


-- ---------------------------------------------------------------- 5. Concepto por defecto del atajo
-- Nombre del tipo de movimiento en el idioma de la interfaz (los mismos textos
-- que la web: tipo.* de movimientos). Español si el idioma no es conocido.
create function concepto_por_defecto(p_tipo tipo_movimiento, p_idioma text) returns text
language sql immutable set search_path = public as $$
  select case coalesce(p_idioma, 'es')
    when 'en' then case p_tipo when 'gasto' then 'Expense' when 'ingreso' then 'Income' when 'devolucion' then 'Refund'
                               when 'traspaso' then 'Transfer' else 'Adjustment' end
    when 'ca' then case p_tipo when 'gasto' then 'Despesa' when 'ingreso' then 'Ingrés' when 'devolucion' then 'Devolució'
                               when 'traspaso' then 'Traspàs' else 'Ajust' end
    else           case p_tipo when 'gasto' then 'Gasto' when 'ingreso' then 'Ingreso' when 'devolucion' then 'Devolución'
                               when 'traspaso' then 'Traspaso' else 'Ajuste' end
  end
$$;

-- Igual que en 20261015000000_esquema_inicial.sql salvo el concepto por defecto (paso 9).
create or replace function registrar_movimiento(
  token     text,
  tipo      text,
  importe   text,
  concepto  text default null,
  categoria text default null,
  metodo    text default null,
  fecha     text default null,
  comercio  text default null,
  desde     text default null,
  hacia     text default null,
  clave     text default null
) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_user      uuid;
  v_token_id  uuid;
  v_tipo      tipo_movimiento;
  v_sentido   sentido_ajuste;
  v_importe   numeric;
  v_metodo    metodo_pago;
  v_cat       uuid;
  v_cat_nom   text;
  v_cat_in    text := nullif(btrim(coalesce(registrar_movimiento.categoria, '')), '');
  v_cuenta    uuid;
  v_destino   uuid;
  v_fecha     date;
  v_hora      time;
  v_zona      text;
  v_ahora     timestamp;
  v_comercio  text := nullif(btrim(coalesce(registrar_movimiento.comercio, '')), '');
  v_concepto  text := nullif(btrim(coalesce(registrar_movimiento.concepto, '')), '');
  v_clave     text := nullif(btrim(coalesce(registrar_movimiento.clave, '')), '');
  v_id        uuid;
  t_in        text := lower(btrim(coalesce(registrar_movimiento.tipo, '')));
  m_in        text := lower(btrim(coalesce(registrar_movimiento.metodo, '')));
begin
  -- 1. ¿Quién es? (token)
  select tk.id, tk.user_id into v_token_id, v_user
  from tokens_api tk
  where tk.token_hash = encode(sha256(convert_to(coalesce(registrar_movimiento.token, ''), 'UTF8')), 'hex')
    and not tk.revocado;
  if v_user is null then
    return json_build_object('ok', false, 'error', 'Token no válido. Revisa el token del atajo.');
  end if;

  -- 2. Reintento del mismo envío: devuelve el movimiento ya creado
  if v_clave is not null then
    select m.id into v_id from movimientos m where m.user_id = v_user and m.clave_idempotencia = v_clave;
    if v_id is not null then
      return json_build_object('ok', true, 'id', v_id, 'duplicado', true, 'mensaje', '✅ Ya estaba registrado');
    end if;
  end if;

  v_zona  := coalesce((select p.zona_horaria from perfiles p where p.user_id = v_user), 'Europe/Madrid');
  v_ahora := now() at time zone v_zona;

  -- 3. Tipo
  v_tipo := case
    when t_in in ('gasto') then 'gasto'
    when t_in in ('ingreso', 'rendimiento') then 'ingreso'
    when t_in in ('devolución', 'devolucion', 'reembolso') then 'devolucion'
    when t_in in ('traspaso', 'transferencia entre cuentas') then 'traspaso'
    when t_in in ('ajuste') then 'ajuste'
  end;
  if v_tipo is null then
    return json_build_object('ok', false, 'error', 'Tipo no reconocido: ' || coalesce(registrar_movimiento.tipo, '(vacío)'));
  end if;
  if t_in = 'rendimiento' and v_cat_in is null then
    v_cat_in := 'Rendimientos';
  end if;

  -- 4. Importe (siempre positivo; en un ajuste, el signo del texto decide si suma o resta)
  v_importe := leer_importe(registrar_movimiento.importe);
  if v_importe is null or v_importe <= 0 then
    return json_build_object('ok', false, 'error', 'Importe no válido: ' || coalesce(registrar_movimiento.importe, '(vacío)'));
  end if;
  if v_tipo = 'ajuste' then
    v_sentido := case when registrar_movimiento.importe like '%-%' then 'resta' else 'suma' end;
  end if;

  -- 5. Método
  v_metodo := case
    when m_in in ('tarjeta', 'card') then 'tarjeta'
    when m_in in ('apple pay', 'apple_pay', 'applepay') then 'apple_pay'
    when m_in in ('efectivo', 'cash') then 'efectivo'
    when m_in in ('transferencia') then 'transferencia'
    when m_in in ('bizum') then 'bizum'
    when m_in in ('domiciliación', 'domiciliacion', 'recibo') then 'domiciliacion'
    when m_in = '' then case when v_comercio is not null then 'apple_pay'::metodo_pago else 'tarjeta'::metodo_pago end
  end;
  if v_metodo is null then
    return json_build_object('ok', false, 'error', 'Método no reconocido: ' || registrar_movimiento.metodo);
  end if;

  -- 6. Categoría (por nombre, sin importar mayúsculas)
  if v_tipo in ('gasto', 'ingreso', 'devolucion') then
    select c.id, c.nombre into v_cat, v_cat_nom
    from categorias c
    where c.user_id = v_user and not c.archivada
      and lower(c.nombre) = lower(coalesce(v_cat_in, ''))
      and c.tipo = (case when v_tipo = 'ingreso' then 'ingreso' else 'gasto' end)::tipo_categoria;
    if v_cat is null then
      return json_build_object('ok', false, 'error',
        'Categoría no encontrada: ' || coalesce(v_cat_in, '(vacía)') || '. Válidas: ' ||
        coalesce((select string_agg(c.nombre, ', ' order by c.orden) from categorias c
                  where c.user_id = v_user and not c.archivada
                    and c.tipo = (case when v_tipo = 'ingreso' then 'ingreso' else 'gasto' end)::tipo_categoria), '(ninguna)'));
    end if;
  end if;

  -- 7. Cuentas
  if nullif(btrim(coalesce(registrar_movimiento.desde, '')), '') is not null then
    select cu.id into v_cuenta from cuentas cu where cu.user_id = v_user and lower(cu.nombre) = lower(btrim(registrar_movimiento.desde));
    if v_cuenta is null then return json_build_object('ok', false, 'error', 'Cuenta no encontrada: ' || registrar_movimiento.desde); end if;
  end if;
  if nullif(btrim(coalesce(registrar_movimiento.hacia, '')), '') is not null then
    select cu.id into v_destino from cuentas cu where cu.user_id = v_user and lower(cu.nombre) = lower(btrim(registrar_movimiento.hacia));
    if v_destino is null then return json_build_object('ok', false, 'error', 'Cuenta no encontrada: ' || registrar_movimiento.hacia); end if;
  end if;
  if v_tipo = 'traspaso' then
    if v_cuenta is null or v_destino is null or v_cuenta = v_destino then
      return json_build_object('ok', false, 'error', 'Un traspaso necesita "desde" y "hacia" con cuentas distintas.');
    end if;
  else
    -- Ingresos y devoluciones entran en "hacia"; gastos salen de "desde"
    if v_tipo in ('ingreso', 'devolucion', 'ajuste') and v_destino is not null then v_cuenta := v_destino; end if;
    v_destino := null;
    if v_cuenta is null then
      select cu.id into v_cuenta from cuentas cu
      where cu.user_id = v_user and not cu.archivada
        and (case when v_metodo = 'efectivo' then cu.tipo = 'efectivo' else cu.es_principal end)
      order by cu.orden limit 1;
    end if;
    if v_cuenta is null then
      return json_build_object('ok', false, 'error', 'No hay cuenta principal. Marca una cuenta con es_principal = true.');
    end if;
  end if;

  -- 8. Fecha: la que llegue (yyyy-MM-dd o ISO) o la de hoy en la zona del usuario
  begin
    if nullif(btrim(coalesce(registrar_movimiento.fecha, '')), '') is null then
      v_fecha := v_ahora::date; v_hora := v_ahora::time(0);
    elsif length(btrim(registrar_movimiento.fecha)) = 10 then
      v_fecha := btrim(registrar_movimiento.fecha)::date;
      if v_fecha = v_ahora::date then v_hora := v_ahora::time(0); end if;
    else
      v_fecha := (btrim(registrar_movimiento.fecha)::timestamptz at time zone v_zona)::date;
      v_hora  := (btrim(registrar_movimiento.fecha)::timestamptz at time zone v_zona)::time(0);
    end if;
  exception when others then
    return json_build_object('ok', false, 'error', 'Fecha no válida: ' || registrar_movimiento.fecha || ' (usa yyyy-MM-dd)');
  end;
  if v_fecha > v_ahora::date + 1 then
    return json_build_object('ok', false, 'error', 'La fecha está en el futuro: ' || v_fecha);
  end if;

  -- 9. Guardar (las reglas de la base devuelven un error legible)
  begin
    insert into movimientos (user_id, fecha, hora, concepto, comercio, tipo, importe, sentido, categoria_id, metodo,
                             cuenta_id, cuenta_destino_id, origen, clave_idempotencia)
    values (v_user, v_fecha, v_hora,
            coalesce(v_concepto, v_comercio,
                     concepto_por_defecto(v_tipo, (select p.idioma from perfiles p where p.user_id = v_user))),
            v_comercio, v_tipo, v_importe, v_sentido, v_cat,
            case when v_tipo in ('traspaso', 'ajuste') then null else v_metodo end,
            v_cuenta, v_destino,
            (case when v_comercio is not null then 'apple_pay' else 'atajo' end)::origen_movimiento,
            v_clave)
    returning id into v_id;
  exception
    when unique_violation then
      select m.id into v_id from movimientos m where m.user_id = v_user and m.clave_idempotencia = v_clave;
      if v_id is not null then
        return json_build_object('ok', true, 'id', v_id, 'duplicado', true, 'mensaje', '✅ Ya estaba registrado');
      end if;
      return json_build_object('ok', false, 'error', 'Movimiento duplicado');
    when check_violation then
      return json_build_object('ok', false, 'error', sqlerrm);
  end;

  update tokens_api set ultimo_uso = now() where id = v_token_id;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'mensaje', '✅ ' ||
      case v_tipo when 'gasto' then 'Gasto' when 'ingreso' then 'Ingreso' when 'devolucion' then 'Devolución'
                  when 'traspaso' then 'Traspaso' else 'Ajuste' end
      || ' de ' || translate(to_char(v_importe, 'FM9G999G999G990D00'), ',.', '.,') || ' €'
      || coalesce(' · ' || v_cat_nom, '')
  );
end $$;


-- ---------------------------------------------------------------- Permisos de funciones
-- Supabase concede EXECUTE a PUBLIC, anon y authenticated sobre toda función
-- nueva. La del trigger no la llama nadie directamente, y concepto_por_defecto
-- solo la usa registrar_movimiento (security definer: se ejecuta como su dueño).
-- `create or replace` conserva los permisos de preparar_usuario,
-- completar_onboarding y registrar_movimiento.
revoke execute on function limpiar_clave_cuenta() from public, anon, authenticated;
revoke execute on function concepto_por_defecto(tipo_movimiento, text) from public, anon, authenticated;
