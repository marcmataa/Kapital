-- =====================================================================
--  Kapital · Mis Finanzas · Esquema inicial (Supabase / PostgreSQL 15+)
--
--  Referencia obligatoria: docs/reglas-financieras.md
--  Parte de Documents/schema.sql (versión del usuario) con las correcciones
--  necesarias para cumplir ese documento. Rollback:
--  supabase/rollback/20261015000000_esquema_inicial.down.sql
--
--  Principios:
--   · Importes en numeric(12,2), SIEMPRE positivos. El signo lo da el tipo.
--   · Un movimiento afecta a cuenta_id (sale en gasto, entra en ingreso y
--     devolución). Un traspaso sale de cuenta_id y entra en cuenta_destino_id.
--     Un ajuste suma o resta en cuenta_id según `sentido`.
--   · Valor de un día D = cierre de D en Europe/Madrid, con los movimientos
--     de D incluidos.
--   · Cada fila pertenece a un usuario: RLS + claves foráneas compuestas
--     (id, user_id) para que ninguna fila apunte a datos de otro usuario.
-- =====================================================================


-- ---------------------------------------------------------------- Tipos
create type tipo_movimiento   as enum ('gasto', 'ingreso', 'devolucion', 'traspaso', 'ajuste');
create type metodo_pago       as enum ('tarjeta', 'apple_pay', 'efectivo', 'transferencia', 'bizum', 'domiciliacion');
create type tipo_categoria    as enum ('gasto', 'ingreso');
create type origen_movimiento as enum ('app', 'atajo', 'apple_pay', 'importado');
create type tipo_cuenta       as enum ('banco', 'efectivo', 'inversion', 'pasivo', 'por_cobrar');
create type sentido_ajuste    as enum ('suma', 'resta');
create type tipo_objetivo     as enum ('ahorro_mensual', 'limite_categoria');


-- ---------------------------------------------------------------- Perfiles
create table perfiles (
  user_id       uuid primary key default auth.uid() references auth.users on delete cascade,
  zona_horaria  text not null default 'Europe/Madrid',
  idioma        text not null default 'es' check (idioma in ('es', 'en', 'ca')),
  created_at    timestamptz not null default now()
);

create function validar_perfil() returns trigger
language plpgsql set search_path = public as $$
begin
  perform now() at time zone new.zona_horaria;   -- lanza error si la zona no existe
  return new;
end $$;

create trigger perfiles_validar before insert or update on perfiles
  for each row execute function validar_perfil();


-- ---------------------------------------------------------------- Fechas
-- Día local de un instante. Toda fecha "de hoy" pasa por aquí.
create function fecha_local(p_instante timestamptz, p_zona text default 'Europe/Madrid') returns date
language sql stable set search_path = public as $$
  select (p_instante at time zone p_zona)::date
$$;

-- Hoy en la zona del usuario (Europe/Madrid si no tiene perfil).
create function hoy_usuario() returns date
language sql stable set search_path = public as $$
  select fecha_local(now(), coalesce(
    (select p.zona_horaria from perfiles p where p.user_id = auth.uid()), 'Europe/Madrid'))
$$;


-- ---------------------------------------------------------------- Cuentas
create table cuentas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  nombre         text not null check (btrim(nombre) <> ''),
  tipo           tipo_cuenta not null default 'banco',
  emoji          text,
  -- Activos: lo que vale al empezar. Pasivos: lo que debes al empezar (>= 0).
  saldo_inicial  numeric(12,2) not null default 0,
  fecha_inicial  date not null default '2000-01-01',   -- los movimientos anteriores ya están en el saldo inicial
  fecha_cierre   date,                                  -- se cierra con valor 0; conserva su historia
  es_principal   boolean not null default false,        -- cuenta por defecto para tarjeta/bizum/transferencia
  orden          int not null default 0,
  archivada      boolean generated always as (fecha_cierre is not null) stored,
  created_at     timestamptz not null default now(),
  unique (user_id, nombre),
  unique (id, user_id),
  check (fecha_cierre is null or fecha_cierre >= fecha_inicial),
  check (tipo <> 'pasivo' or saldo_inicial >= 0)
);
create unique index cuentas_una_principal on cuentas (user_id) where es_principal;


-- ---------------------------------------------------------------- Categorías
create table categorias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  nombre      text not null check (btrim(nombre) <> ''),
  tipo        tipo_categoria not null,
  color       text not null default '#8f9bbd',
  icono       text,
  orden       int not null default 0,
  archivada   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, nombre),
  unique (id, user_id)
);


-- ---------------------------------------------------------------- Movimientos
create table movimientos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  fecha               date not null default hoy_usuario(),   -- día en que ocurrió (hora local)
  hora                time,
  concepto            text not null,
  comercio            text,
  tipo                tipo_movimiento not null,
  importe             numeric(12,2) not null check (importe > 0),
  sentido             sentido_ajuste,                         -- solo ajustes
  categoria_id        uuid,
  metodo              metodo_pago,
  cuenta_id           uuid not null,                          -- de dónde sale / a dónde entra
  cuenta_destino_id   uuid,                                   -- solo traspasos
  devolucion_de       uuid,                                   -- gasto original que te devuelven
  notas               text,
  origen              origen_movimiento not null default 'app',
  notion_id           text,                                   -- importar sin duplicados
  clave_idempotencia  text,                                   -- reintentos del atajo sin duplicados
  created_at          timestamptz not null default now(),     -- hora de registro (dato técnico)
  updated_at          timestamptz not null default now(),

  unique (id, user_id),
  unique (user_id, notion_id),
  unique (user_id, clave_idempotencia),

  foreign key (cuenta_id, user_id)         references cuentas (id, user_id),
  foreign key (cuenta_destino_id, user_id) references cuentas (id, user_id),
  -- Las categorías con movimientos se archivan, no se borran.
  foreign key (categoria_id, user_id)      references categorias (id, user_id),
  foreign key (devolucion_de, user_id)     references movimientos (id, user_id) on delete set null (devolucion_de),

  constraint traspaso_con_destino check (
    (tipo = 'traspaso' and cuenta_destino_id is not null and cuenta_destino_id <> cuenta_id)
    or (tipo <> 'traspaso' and cuenta_destino_id is null)
  ),
  constraint categoria_segun_tipo check (
    (tipo in ('gasto', 'ingreso', 'devolucion') and categoria_id is not null)
    or (tipo in ('traspaso', 'ajuste') and categoria_id is null)
  ),
  constraint sentido_solo_en_ajuste check ((tipo = 'ajuste') = (sentido is not null)),
  constraint devolucion_de_solo_en_devolucion check (devolucion_de is null or tipo = 'devolucion'),
  constraint clave_no_vacia check (clave_idempotencia is null or btrim(clave_idempotencia) <> '')
);

create index movimientos_user_fecha   on movimientos (user_id, fecha desc);
create index movimientos_categoria    on movimientos (categoria_id);
create index movimientos_cuenta       on movimientos (cuenta_id, fecha);
create index movimientos_destino      on movimientos (cuenta_destino_id, fecha) where cuenta_destino_id is not null;
create index movimientos_devolucion   on movimientos (devolucion_de) where devolucion_de is not null;

create function validar_movimiento() returns trigger
language plpgsql set search_path = public as $$
declare
  v_tipo_cat  tipo_categoria;
  v_cuenta    record;
  v_original  record;
  v_devuelto  numeric;
begin
  -- 1. La categoría debe ser del tipo correcto
  if new.categoria_id is not null then
    select c.tipo into v_tipo_cat from categorias c
    where c.id = new.categoria_id and c.user_id = new.user_id;
    if new.tipo in ('gasto', 'devolucion') and v_tipo_cat <> 'gasto' then
      raise exception '% necesita una categoría de gasto',
        case new.tipo when 'gasto' then 'Un gasto' else 'Una devolución' end using errcode = '23514';
    elsif new.tipo = 'ingreso' and v_tipo_cat <> 'ingreso' then
      raise exception 'Un ingreso necesita una categoría de ingreso' using errcode = '23514';
    end if;
  end if;

  -- 2. La fecha no puede ser anterior a la fecha de partida de las cuentas
  --    (las cuentas cerradas se protegen en proteger_cuenta_cerrada)
  for v_cuenta in
    select c.nombre, c.fecha_inicial from cuentas c
    where c.user_id = new.user_id and c.id in (new.cuenta_id, new.cuenta_destino_id)
  loop
    if new.fecha < v_cuenta.fecha_inicial then
      raise exception 'La cuenta % empieza el %; el movimiento es del %',
        v_cuenta.nombre, v_cuenta.fecha_inicial, new.fecha using errcode = '23514';
    end if;
  end loop;

  -- 3. Una devolución vinculada apunta a un gasto y no lo supera
  if new.devolucion_de is not null then
    select m.tipo, m.importe into v_original from movimientos m
    where m.id = new.devolucion_de and m.user_id = new.user_id;
    if found then
      if v_original.tipo <> 'gasto' then
        raise exception 'Solo se puede devolver un gasto' using errcode = '23514';
      end if;
      select coalesce(sum(m.importe), 0) into v_devuelto from movimientos m
      where m.devolucion_de = new.devolucion_de and m.id <> new.id;
      if v_devuelto + new.importe > v_original.importe then
        raise exception 'Las devoluciones (% €) superan el gasto original (% €)',
          v_devuelto + new.importe, v_original.importe using errcode = '23514';
      end if;
    end if;
  end if;

  -- 4. Un gasto con devoluciones no puede quedar por debajo de lo devuelto
  if tg_op = 'UPDATE' and old.tipo = 'gasto' then
    select coalesce(sum(m.importe), 0) into v_devuelto from movimientos m where m.devolucion_de = new.id;
    if v_devuelto > 0 and (new.tipo <> 'gasto' or new.importe < v_devuelto) then
      raise exception 'Este gasto tiene % € devueltos; no puede bajar de esa cantidad ni cambiar de tipo',
        v_devuelto using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger movimientos_validar before insert or update on movimientos
  for each row execute function validar_movimiento();


-- ---------------------------------------------------------------- Valoraciones
-- «Esta cuenta de inversión valía X € al cierre del día D». No son movimientos.
create table valoraciones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  cuenta_id   uuid not null,
  fecha       date not null,
  valor       numeric(12,2) not null check (valor >= 0),
  nota        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cuenta_id, fecha),   -- una por cuenta y día: otra el mismo día la sustituye (upsert)
  foreign key (cuenta_id, user_id) references cuentas (id, user_id) on delete cascade
);
create index valoraciones_cuenta_fecha on valoraciones (cuenta_id, fecha desc);

create function validar_valoracion() returns trigger
language plpgsql set search_path = public as $$
declare v_cuenta record;
begin
  select c.nombre, c.tipo, c.fecha_inicial, c.fecha_cierre into v_cuenta
  from cuentas c where c.id = new.cuenta_id and c.user_id = new.user_id;
  if found then
    if v_cuenta.tipo <> 'inversion' then
      raise exception 'Solo las cuentas de inversión tienen valoraciones (% es %)',
        v_cuenta.nombre, v_cuenta.tipo using errcode = '23514';
    end if;
    if new.fecha < v_cuenta.fecha_inicial
       or (v_cuenta.fecha_cierre is not null and new.fecha > v_cuenta.fecha_cierre) then
      raise exception 'La valoración del % está fuera de la vida de la cuenta %',
        new.fecha, v_cuenta.nombre using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger valoraciones_validar before insert or update on valoraciones
  for each row execute function validar_valoracion();


-- ---------------------------------------------------------------- Cuentas cerradas
-- Una cuenta cerrada vale 0 desde su cierre: cualquier cambio en sus movimientos
-- o valoraciones haría aparecer o desaparecer dinero. Para corregir, se reabre.
-- Los borrados en cascada (p. ej. al borrar el usuario) sí se permiten.
create function proteger_cuenta_cerrada() returns trigger
language plpgsql set search_path = public as $$
declare
  v_ids    uuid[] := '{}';
  v_nombre text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op <> 'DELETE' then
    v_ids := v_ids || new.cuenta_id;
    if tg_table_name = 'movimientos' then v_ids := v_ids || new.cuenta_destino_id; end if;
  end if;
  if tg_op <> 'INSERT' then
    v_ids := v_ids || old.cuenta_id;
    if tg_table_name = 'movimientos' then v_ids := v_ids || old.cuenta_destino_id; end if;
  end if;

  select c.nombre into v_nombre from cuentas c
  where c.id = any (v_ids) and c.fecha_cierre is not null
  limit 1;
  if v_nombre is not null then
    raise exception 'La cuenta % está cerrada: reábrela para cambiar sus datos', v_nombre using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger movimientos_cuenta_cerrada before insert or update or delete on movimientos
  for each row execute function proteger_cuenta_cerrada();
create trigger valoraciones_cuenta_cerrada before insert or update or delete on valoraciones
  for each row execute function proteger_cuenta_cerrada();


-- ---------------------------------------------------------------- Objetivos
create table objetivos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  tipo          tipo_objetivo not null,
  categoria_id  uuid,
  importe       numeric(12,2) not null check (importe > 0),
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  foreign key (categoria_id, user_id) references categorias (id, user_id) on delete cascade,
  check ((tipo = 'limite_categoria') = (categoria_id is not null))
);
create unique index objetivos_un_ahorro_activo on objetivos (user_id) where tipo = 'ahorro_mensual' and activo;
create unique index objetivos_un_limite_activo on objetivos (user_id, categoria_id) where tipo = 'limite_categoria' and activo;

create function validar_objetivo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.categoria_id is not null and not exists (
    select 1 from categorias c where c.id = new.categoria_id and c.user_id = new.user_id and c.tipo = 'gasto'
  ) then
    raise exception 'Un límite de categoría necesita una categoría de gasto' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger objetivos_validar before insert or update on objetivos
  for each row execute function validar_objetivo();


-- ---------------------------------------------------------------- Tokens del atajo
-- El atajo no inicia sesión: usa un token personal. Solo se guarda su hash.
create table tokens_api (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  nombre      text not null,
  token_hash  text not null unique,
  ultimo_uso  timestamptz,
  revocado    boolean not null default false,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------- Cálculos: saldos y patrimonio
-- Efecto con signo de cada movimiento sobre cada cuenta (un traspaso genera dos filas).
create view v_efectos with (security_invoker = true) as
  select m.id as movimiento_id, m.user_id, m.fecha, m.cuenta_id,
         case m.tipo
           when 'gasto'    then -m.importe
           when 'traspaso' then -m.importe
           when 'ajuste'   then case m.sentido when 'resta' then -m.importe else m.importe end
           else m.importe                                   -- ingreso, devolucion
         end as delta
  from movimientos m
  union all
  select m.id, m.user_id, m.fecha, m.cuenta_destino_id, m.importe
  from movimientos m where m.tipo = 'traspaso';

-- Valor contable de una cuenta al cierre de D (sección 4 y 6).
-- Pasivos en negativo (lo que debes). NULL si la cuenta aún no existía en D.
create function valor_cuenta(p_cuenta uuid, p_fecha date) returns numeric
language plpgsql stable set search_path = public as $$
declare
  c  cuentas;
  v  valoraciones;
begin
  select * into c from cuentas where id = p_cuenta;
  if not found or p_fecha < c.fecha_inicial then
    return null;
  end if;
  if c.fecha_cierre is not null and p_fecha > c.fecha_cierre then
    return 0.00;
  end if;

  if c.tipo = 'inversion' then
    select * into v from valoraciones
    where cuenta_id = p_cuenta and fecha <= p_fecha
    order by fecha desc limit 1;
    if found then
      -- La valoración ya incluye los movimientos de su propio día.
      return v.valor + coalesce((select sum(e.delta) from v_efectos e
        where e.cuenta_id = p_cuenta and e.fecha > v.fecha and e.fecha <= p_fecha), 0);
    end if;
  end if;

  return (case when c.tipo = 'pasivo' then -c.saldo_inicial else c.saldo_inicial end)
    + coalesce((select sum(e.delta) from v_efectos e
        where e.cuenta_id = p_cuenta and e.fecha >= c.fecha_inicial and e.fecha <= p_fecha), 0);
end $$;

-- Una cuenta solo se cierra con valor 0, y no se le puede mover la fecha de
-- partida por delante de movimientos o valoraciones que ya tiene.
create function validar_cuenta() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.fecha_inicial > old.fecha_inicial and exists (
      select 1 from v_efectos e where e.cuenta_id = new.id and e.fecha < new.fecha_inicial
      union all
      select 1 from valoraciones v where v.cuenta_id = new.id and v.fecha < new.fecha_inicial
    ) then
      raise exception 'La cuenta % tiene datos anteriores al %', new.nombre, new.fecha_inicial using errcode = '23514';
    end if;
    if new.tipo <> old.tipo and old.tipo = 'inversion'
       and exists (select 1 from valoraciones v where v.cuenta_id = new.id) then
      raise exception 'La cuenta % tiene valoraciones: no puede dejar de ser de inversión', new.nombre using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger cuentas_validar before update on cuentas
  for each row execute function validar_cuenta();

-- El cierre se comprueba DESPUÉS de guardar, para calcular con los datos nuevos.
create function validar_cierre_cuenta() returns trigger
language plpgsql set search_path = public as $$
declare v_valor numeric;
begin
  if new.fecha_cierre is not null then
    if exists (
      select 1 from v_efectos e where e.cuenta_id = new.id and e.fecha > new.fecha_cierre
      union all
      select 1 from valoraciones v where v.cuenta_id = new.id and v.fecha > new.fecha_cierre
    ) then
      raise exception 'La cuenta % tiene movimientos posteriores al %: no se puede cerrar en esa fecha',
        new.nombre, new.fecha_cierre using errcode = '23514';
    end if;
    v_valor := valor_cuenta(new.id, new.fecha_cierre);
    if v_valor is distinct from 0 then
      raise exception 'La cuenta % no se puede cerrar el % con valor % € (debe ser 0)',
        new.nombre, new.fecha_cierre, v_valor using errcode = '23514';
    end if;
  end if;
  return null;
end $$;

create constraint trigger cuentas_validar_cierre after insert or update of fecha_cierre on cuentas
  for each row execute function validar_cierre_cuenta();

-- Patrimonio al cierre de D: suma del valor de todas las cuentas que existían.
-- NULL si ninguna cuenta existía (el gráfico no inventa puntos).
create function patrimonio(p_fecha date) returns numeric
language sql stable set search_path = public as $$
  select sum(valor_cuenta(c.id, p_fecha))
  from cuentas c
  where c.user_id = auth.uid() and c.fecha_inicial <= p_fecha
$$;

-- Saldo de hoy de las cuentas activas.
create view v_saldos with (security_invoker = true) as
  select c.id, c.user_id, c.nombre, c.tipo, c.emoji, c.orden, c.saldo_inicial,
         valor_cuenta(c.id, hoy_usuario()) as valor
  from cuentas c
  where not c.archivada;


-- ---------------------------------------------------------------- Cálculos: balance y gasto
-- Balance de un periodo [desde, hasta] por fecha del movimiento (sección 3).
-- Traspasos, ajustes y valoraciones NO entran. Ahorro NULL si no hay ingresos.
create function resumen_periodo(p_desde date, p_hasta date)
returns table (ingresos numeric, gastos numeric, devoluciones numeric, gastos_netos numeric,
               balance numeric, ahorro_pct numeric, ajustes numeric)
language sql stable set search_path = public as $$
  with t as (
    select
      coalesce(sum(m.importe) filter (where m.tipo = 'ingreso'), 0.00)    as ingresos,
      coalesce(sum(m.importe) filter (where m.tipo = 'gasto'), 0.00)      as gastos,
      coalesce(sum(m.importe) filter (where m.tipo = 'devolucion'), 0.00) as devoluciones,
      coalesce(sum(case m.sentido when 'resta' then -m.importe else m.importe end)
               filter (where m.tipo = 'ajuste'), 0.00)                    as ajustes
    from movimientos m
    where m.user_id = auth.uid() and m.fecha between p_desde and p_hasta
  )
  select t.ingresos, t.gastos, t.devoluciones,
         t.gastos - t.devoluciones,
         t.ingresos - (t.gastos - t.devoluciones),
         case when t.ingresos > 0 then (t.ingresos - (t.gastos - t.devoluciones)) / t.ingresos * 100 end,
         t.ajustes
  from t
$$;

-- Un resumen por mes natural entre dos fechas (meses sin movimientos salen a 0).
create function resumen_mensual(p_desde date, p_hasta date)
returns table (mes date, ingresos numeric, gastos numeric, devoluciones numeric, gastos_netos numeric,
               balance numeric, ahorro_pct numeric, ajustes numeric)
language sql stable set search_path = public as $$
  select m::date, r.*
  from generate_series(date_trunc('month', p_desde::timestamp), date_trunc('month', p_hasta::timestamp), interval '1 month') m
  cross join lateral resumen_periodo(m::date, (m + interval '1 month - 1 day')::date) r
$$;

-- Gasto neto por categoría (sección 8): gastos − devoluciones. Puede ser negativo.
create function gasto_por_categoria(p_desde date, p_hasta date)
returns table (categoria_id uuid, nombre text, color text, icono text, gasto numeric)
language sql stable set search_path = public as $$
  select c.id, c.nombre, c.color, c.icono,
         sum(case when m.tipo = 'gasto' then m.importe else -m.importe end)
  from movimientos m
  join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
  where m.user_id = auth.uid() and m.tipo in ('gasto', 'devolucion')
    and m.fecha between p_desde and p_hasta
  group by c.id
$$;

-- Gasto por método de pago: solo gastos; las devoluciones NO restan aquí.
create function gasto_por_metodo(p_desde date, p_hasta date)
returns table (metodo metodo_pago, gasto numeric)
language sql stable set search_path = public as $$
  select m.metodo, sum(m.importe)
  from movimientos m
  where m.user_id = auth.uid() and m.tipo = 'gasto' and m.fecha between p_desde and p_hasta
  group by m.metodo
$$;


-- ---------------------------------------------------------------- Cálculos: variación patrimonial
-- Revalorización de una cuenta entre el cierre de D1 y el de D2 (sección 5):
-- (Valor(D2) − Valor(D1)) − flujos netos en (D1, D2]. Si la cuenta abrió
-- dentro del periodo, se parte de su saldo inicial.
create function revalorizacion(p_cuenta uuid, p_d1 date, p_d2 date) returns numeric
language plpgsql stable set search_path = public as $$
declare
  c        cuentas;
  v_ini    numeric;
  v_fin    numeric;
  v_desde  date;
begin
  select * into c from cuentas where id = p_cuenta;
  v_fin := valor_cuenta(p_cuenta, p_d2);
  if v_fin is null then return null; end if;
  v_ini := valor_cuenta(p_cuenta, p_d1);
  if v_ini is null then
    v_ini := case when c.tipo = 'pasivo' then -c.saldo_inicial else c.saldo_inicial end;
    v_desde := c.fecha_inicial - 1;
  else
    v_desde := p_d1;
  end if;
  return v_fin - v_ini - coalesce((select sum(e.delta) from v_efectos e
    where e.cuenta_id = p_cuenta and e.fecha > v_desde and e.fecha <= p_d2), 0);
end $$;

-- ΔPatrimonio = Balance + Revalorización + Ajustes (+ saldos iniciales de
-- cuentas abiertas dentro del periodo, que no son ganancia ni gasto).
create function variacion_patrimonial(p_d1 date, p_d2 date)
returns table (patrimonio_inicial numeric, patrimonio_final numeric, balance numeric,
               revalorizacion numeric, ajustes numeric, saldos_iniciales numeric, variacion numeric)
language sql stable set search_path = public as $$
  with
    r as (select * from resumen_periodo(p_d1 + 1, p_d2)),
    inv as (
      select coalesce(sum(revalorizacion(c.id, p_d1, p_d2)), 0.00) as reval
      from cuentas c
      where c.user_id = auth.uid() and c.tipo = 'inversion' and c.fecha_inicial <= p_d2
    ),
    nuevas as (
      select coalesce(sum(case when c.tipo = 'pasivo' then -c.saldo_inicial else c.saldo_inicial end), 0.00) as s
      from cuentas c
      where c.user_id = auth.uid() and c.fecha_inicial > p_d1 and c.fecha_inicial <= p_d2
    ),
    p as (select coalesce(patrimonio(p_d1), 0.00) as ini, coalesce(patrimonio(p_d2), 0.00) as fin)
  select p.ini, p.fin, r.balance, inv.reval, r.ajustes, nuevas.s, p.fin - p.ini
  from p, r, inv, nuevas
$$;


-- ---------------------------------------------------------------- Cálculos: serie diaria y comparativas
-- Día equivalente del mes anterior (sección 7): d' = min(d, último día del mes anterior).
create function dia_equivalente_mes_anterior(p_fecha date) returns date
language sql immutable set search_path = public as $$
  select (p_fecha - interval '1 month')::date   -- PostgreSQL ajusta al último día del mes
$$;

-- Patrimonio al cierre de cada día entre dos fechas. No hay puntos futuros ni
-- anteriores a los datos; el día de hoy se marca como provisional.
create function serie_patrimonio(p_desde date, p_hasta date, p_hoy date default hoy_usuario())
returns table (fecha date, patrimonio numeric, provisional boolean)
language sql stable set search_path = public as $$
  select s.fecha, s.patrimonio, s.fecha = p_hoy
  from (
    select d::date as fecha, patrimonio(d::date) as patrimonio
    from generate_series(p_desde::timestamp, least(p_hasta, p_hoy)::timestamp, interval '1 day') d
  ) s
  where s.patrimonio is not null
  order by s.fecha
$$;

-- Variación porcentual (sección 8). NULL = «Sin datos del mes anterior».
create function variacion_porcentual(p_actual numeric, p_anterior numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when p_anterior is null or p_anterior = 0 or p_actual is null then null
              else (p_actual - p_anterior) / abs(p_anterior) * 100 end
$$;


-- ---------------------------------------------------------------- Seguridad (RLS)
alter table perfiles     enable row level security;
alter table cuentas      enable row level security;
alter table categorias   enable row level security;
alter table movimientos  enable row level security;
alter table valoraciones enable row level security;
alter table objetivos    enable row level security;
alter table tokens_api   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['perfiles', 'cuentas', 'categorias', 'movimientos', 'valoraciones', 'objetivos', 'tokens_api'] loop
    execute format(
      'create policy solo_mis_datos on %I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- El rol anónimo no toca tablas: el atajo entra solo por registrar_movimiento.
revoke all on all tables in schema public from anon;
-- El hash de un token no se puede cambiar desde la app: solo revocarlo.
revoke update on tokens_api from authenticated;
grant update (revocado, nombre) on tokens_api to authenticated;


-- =====================================================================
--  Atajo del iPhone
-- =====================================================================

-- Convierte "38,50", "38.50", "1.200,50", "-24 €"… en 38.50 (siempre positivo).
create function leer_importe(p text) returns numeric
language plpgsql immutable set search_path = public as $$
declare s text := regexp_replace(coalesce(p, ''), '[^0-9,.\-]', '', 'g');
begin
  s := replace(s, '-', '');
  if s like '%,%' then
    s := replace(replace(s, '.', ''), ',', '.');          -- formato español
  elsif s ~ '^\d{1,3}(\.\d{3})+$' then
    s := replace(s, '.', '');                              -- 1.200 = mil doscientos
  end if;
  if s = '' then return null; end if;
  return round(s::numeric, 2);
exception when others then return null;
end $$;

-- Crea un token para el usuario con sesión y lo devuelve UNA sola vez.
create function crear_token(p_nombre text default 'iPhone') returns text
language plpgsql security invoker set search_path = public as $$
declare t text := 'mf_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into tokens_api (nombre, token_hash) values (p_nombre, encode(sha256(convert_to(t, 'UTF8')), 'hex'));
  return t;
end $$;

-- Registra un movimiento desde el atajo:
--   POST https://<proyecto>.supabase.co/rest/v1/rpc/registrar_movimiento
-- Devuelve {"ok": true, "id": ..., "mensaje": "✅ ..."} o {"ok": false, "error": "..."}.
-- `clave`: identificador único del envío; si iOS reintenta, no se duplica.
create function registrar_movimiento(
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
            coalesce(v_concepto, v_comercio, initcap(v_tipo::text)),
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


-- =====================================================================
--  Puesta en marcha (una sola vez, desde el SQL Editor de Supabase)
--  1) Crea tu usuario en Authentication → Users → Add user.
--  2) Ejecuta:  select preparar_usuario('tu@email.com');
--     Crea perfil, cuentas y categorías y devuelve el TOKEN del atajo.
--     Cópialo directamente al atajo: no se puede volver a ver.
-- =====================================================================
create function preparar_usuario(p_email text, p_dispositivo text default 'iPhone') returns text
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


-- ---------------------------------------------------------------- Permisos de funciones
-- Supabase concede EXECUTE a anon/authenticated por defecto: se quita todo y
-- se concede solo lo necesario.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  fecha_local(timestamptz, text),
  hoy_usuario(),
  valor_cuenta(uuid, date),
  patrimonio(date),
  resumen_periodo(date, date),
  resumen_mensual(date, date),
  gasto_por_categoria(date, date),
  gasto_por_metodo(date, date),
  revalorizacion(uuid, date, date),
  variacion_patrimonial(date, date),
  dia_equivalente_mes_anterior(date),
  serie_patrimonio(date, date, date),
  variacion_porcentual(numeric, numeric),
  leer_importe(text),
  crear_token(text)
to authenticated;

grant execute on function
  registrar_movimiento(text, text, text, text, text, text, text, text, text, text, text)
to anon, authenticated;
-- preparar_usuario: sin permisos; solo desde el SQL Editor (rol postgres).
