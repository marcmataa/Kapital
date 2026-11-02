-- =====================================================================
--  Kapital · Devoluciones vinculadas a su gasto original
--
--  Reglas:   docs/reglas-financieras.md, sección 3 («Devoluciones»), 9, 10 y 11.
--  Rollback: supabase/rollback/20261102000001_devoluciones_vinculadas.down.sql
--  Tests:    tests/db/devoluciones-vinculadas.test.ts (+ seguridad, atajo)
--
--  Alcance: solo el registro y la validación de devoluciones. Las vistas de
--  balance y categorías NO cambian (la imputación al mes de la compra queda
--  fuera de esta migración).
--
--   1. Vínculo obligatorio: toda devolución nueva (insert) lleva devolucion_de,
--      venga de la web, de un insert directo o de una importación. Las antiguas
--      sin vínculo se conservan y siguen sumando; si se editan, el cambio solo
--      se acepta si quedan vinculadas.
--   2. Categoría heredada: la devolución tiene SIEMPRE la categoría de su gasto
--      (aunque el cliente envíe otra). Si cambia la del gasto, cambian las de
--      sus devoluciones.
--   3. Límite: lo devuelto de un gasto no supera su importe. El gasto se bloquea
--      (`for update`) para que dos devoluciones simultáneas no lo superen.
--   4. Fecha: la devolución no es anterior a su gasto, y un gasto con
--      devoluciones no pasa a una fecha posterior a alguna de ellas.
--   5. El vínculo apunta a un gasto del mismo usuario (clave compuesta + RLS).
--   6. El gasto original no se borra: el error dice cuántas devoluciones tiene y
--      cuánto suman. La clave foránea deja de poner el vínculo a NULL.
--   7. El atajo rechaza las devoluciones (sección 9): se registran desde el
--      formulario de Kapital, donde se elige el gasto.
--   8. buscar_gastos_devolvibles: candidatos para el formulario, puntuados por
--      parecido del concepto, importe y fecha (sin IA ni extensiones).
--      Sustituye a gastos_devolvibles (20261024000001_movimientos_ux.sql).
-- =====================================================================


-- ---------------------------------------------------------------- 6. La clave foránea ya no desvincula
-- Antes: on delete set null (devolucion_de), que dejaba devoluciones huérfanas
-- al borrar el gasto. Ahora el borrado se impide (trigger del punto 6, con un
-- mensaje claro) y la clave lo respalda. Borrar el usuario sigue borrando todo:
-- la comprobación se hace al final de la sentencia, con todo ya borrado.
alter table movimientos drop constraint movimientos_devolucion_de_user_id_fkey;
alter table movimientos add constraint movimientos_devolucion_de_user_id_fkey
  foreign key (devolucion_de, user_id) references movimientos (id, user_id);


-- ---------------------------------------------------------------- 1-5. Validar la devolución
-- Se ejecuta antes de validar_movimiento (los triggers BEFORE van por orden
-- alfabético: movimientos_cuenta_cerrada, movimientos_devolucion,
-- movimientos_validar). La regla 3 de validar_movimiento sigue igual; aquí se
-- comprueba lo mismo con el gasto bloqueado, que es lo que la hace segura con
-- inserciones simultáneas.
create function validar_devolucion() returns trigger
language plpgsql set search_path = public as $$
declare
  v_gasto     record;
  v_devuelto  numeric;
  v_pendiente numeric;
  v_primera   date;
  v_cambia    boolean;
begin
  if new.tipo = 'devolucion' then
    -- 1. Vínculo obligatorio
    if new.devolucion_de is null then
      -- El borrado del usuario (cascada) no pasa por aquí: ya no hay set null.
      if tg_op = 'INSERT' then
        raise exception 'Una devolución necesita el gasto original que devuelve' using errcode = '23514';
      end if;
      raise exception 'Vincula esta devolución a su gasto original antes de guardarla' using errcode = '23514';
    end if;

    -- 5. Un gasto del mismo usuario. Se bloquea hasta el final de la transacción:
    --    otra devolución del mismo gasto espera y después ve esta.
    select m.id, m.tipo, m.importe, m.fecha, m.categoria_id into v_gasto
    from movimientos m
    where m.id = new.devolucion_de and m.user_id = new.user_id
    for update;
    if not found then
      raise exception 'Solo se puede devolver un gasto tuyo que exista' using errcode = '23514';
    end if;
    if v_gasto.tipo <> 'gasto' then
      raise exception 'Solo se puede devolver un gasto' using errcode = '23514';
    end if;

    -- 2. Categoría heredada (aunque el cliente envíe otra)
    new.categoria_id := v_gasto.categoria_id;

    v_cambia := tg_op = 'INSERT' or old.tipo is distinct from new.tipo
                or old.devolucion_de is distinct from new.devolucion_de;

    -- 4. Fecha: no anterior a la compra. Solo si cambia la fecha o el vínculo:
    --    las antiguas que lo incumplen (pendientes de revisión) no impiden, p. ej.,
    --    que cambie la categoría de su gasto.
    if (v_cambia or old.fecha is distinct from new.fecha) and new.fecha < v_gasto.fecha then
      raise exception 'La devolución (%) no puede ser anterior a su gasto (%)', new.fecha, v_gasto.fecha
        using errcode = '23514';
    end if;

    -- 3. Límite: lo devuelto (sin contar esta fila, por si se edita) + esta ≤ gasto
    select coalesce(sum(m.importe), 0) into v_devuelto
    from movimientos m
    where m.devolucion_de = new.devolucion_de and m.user_id = new.user_id and m.id <> new.id;
    v_pendiente := v_gasto.importe - v_devuelto;
    if new.importe > v_pendiente then
      if v_pendiente <= 0 then
        raise exception 'Este gasto ya está devuelto del todo (% €)', v_gasto.importe using errcode = '23514';
      end if;
      raise exception 'Las devoluciones (% €) superan el gasto original (% €): quedan % € por devolver',
        v_devuelto + new.importe, v_gasto.importe, v_pendiente using errcode = '23514';
    end if;

  elsif tg_op = 'UPDATE' and old.tipo = 'gasto' and new.fecha > old.fecha then
    -- 4. Un gasto con devoluciones no pasa a una fecha posterior a alguna de ellas
    select min(m.fecha) into v_primera from movimientos m where m.devolucion_de = new.id and m.user_id = new.user_id;
    if v_primera is not null and new.fecha > v_primera then
      raise exception 'Este gasto tiene devoluciones desde el %: su fecha no puede ser posterior', v_primera
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger movimientos_devolucion before insert or update on movimientos
  for each row execute function validar_devolucion();


-- ---------------------------------------------------------------- 2. La categoría del gasto pasa a sus devoluciones
-- Al actualizar cada devolución, validar_devolucion vuelve a leer la categoría
-- del gasto (ya cambiada).
create function heredar_categoria_devoluciones() returns trigger
language plpgsql set search_path = public as $$
begin
  update movimientos m set categoria_id = new.categoria_id
  where m.devolucion_de = new.id and m.user_id = new.user_id
    and m.categoria_id is distinct from new.categoria_id;
  return null;
end $$;

create trigger movimientos_devoluciones_categoria after update on movimientos
  for each row when (old.tipo = 'gasto' and new.tipo = 'gasto' and old.categoria_id is distinct from new.categoria_id)
  execute function heredar_categoria_devoluciones();


-- ---------------------------------------------------------------- 6. El gasto original no se borra
-- Las devoluciones no se borran ni se desvinculan solas (sección 3). Los
-- borrados en cascada (borrar el usuario) sí se permiten, como en
-- proteger_cuenta_cerrada.
create function proteger_gasto_con_devoluciones() returns trigger
language plpgsql set search_path = public as $$
declare
  v_n     integer;
  v_total numeric;
begin
  if old.tipo = 'gasto' and pg_trigger_depth() <= 1 then
    select count(*), coalesce(sum(m.importe), 0) into v_n, v_total
    from movimientos m where m.devolucion_de = old.id and m.user_id = old.user_id;
    if v_n > 0 then
      raise exception 'Este gasto tiene % devoluciones vinculadas que suman % €: no se puede borrar', v_n, v_total
        using errcode = '23514';
    end if;
  end if;
  return old;
end $$;

create trigger movimientos_proteger_gasto before delete on movimientos
  for each row execute function proteger_gasto_con_devoluciones();


-- ---------------------------------------------------------------- 8. Gastos candidatos para una devolución
-- Sustituye a gastos_devolvibles: además de la lista de recientes, puntúa cada
-- gasto con lo que el formulario ya sabe de la devolución y permite buscar
-- gastos antiguos. Sin IA (nada sale de la base) y sin pg_trgm: el parecido del
-- texto se mide con normalizar_concepto (minúsculas, sin tildes).
--
-- Parámetros (todos opcionales):
--   p_concepto  concepto de la devolución («Devolución Zara»).
--   p_importe   importe tal como se escribe («24,50»; se lee con leer_importe).
--   p_fecha     fecha de la devolución: los gastos posteriores no se ofrecen
--               (la devolución no puede ser anterior a su compra).
--   p_busqueda  texto del buscador: concepto o comercio, un importe («24,50»)
--               o una fecha («2026-03-14», «14/03/2026», «14/03»). Sin límite de
--               fecha hacia atrás.
--   p_excluir   la devolución que se edita: no cuenta contra su propio gasto, y
--               ese gasto se ofrece siempre.
--   p_limite    1..100 (20 por defecto).
--
-- Solo gastos con algo pendiente (importe − Σ devoluciones > 0). Puntuación
-- 0..100 = 50 × texto + 35 × importe + 15 × fecha:
--   texto   1 si el concepto o el comercio coinciden; si no, la fracción de
--           palabras del concepto (3+ letras, sin palabras vacías como
--           «devolución» o «bizum») que aparecen en el gasto o empiezan igual.
--   importe solo si cabe (pendiente ≥ importe): 1 si es exacto (pendiente o
--           importe original), si no importe / pendiente.
--   fecha   1 / (1 + días / 7) desde la compra hasta la devolución.
-- Motivo (código; la web lo traduce): importe_exacto, concepto_parecido,
-- importe_parecido, fecha_cercana o reciente.
create function buscar_gastos_devolvibles(
  p_concepto text default null, p_importe text default null, p_fecha date default null,
  p_busqueda text default null, p_excluir uuid default null, p_limite integer default 20)
returns table (id uuid, fecha date, concepto text, comercio text, importe numeric, pendiente numeric,
               categoria_id uuid, cuenta_id uuid, puntuacion integer, motivo text)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_importe   numeric := leer_importe(p_importe);
  v_q         text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_q_texto   text;
  v_q_importe numeric;
  v_q_fecha   date;
  v_q_dia     integer;
  v_q_mes     integer;
  v_actual    uuid;
begin
  if v_importe is not null and v_importe <= 0 then v_importe := null; end if;
  if p_excluir is not null then
    select m.devolucion_de into v_actual from movimientos m where m.id = p_excluir and m.user_id = auth.uid();
  end if;

  if v_q is not null then
    v_q_texto := normalizar_concepto(v_q);
    if v_q ~ '^-?[0-9][0-9 .,]*(€)?$' then
      v_q_importe := leer_importe(v_q);
    end if;
    begin
      if v_q ~ '^\d{4}-\d{2}-\d{2}$' then
        v_q_fecha := v_q::date;
      elsif v_q ~ '^\d{1,2}/\d{1,2}/\d{4}$' then
        v_q_fecha := to_date(v_q, 'DD/MM/YYYY');
      elsif v_q ~ '^\d{1,2}/\d{1,2}$' then
        v_q_dia := split_part(v_q, '/', 1)::int;
        v_q_mes := split_part(v_q, '/', 2)::int;
      end if;
    exception when others then
      v_q_fecha := null;
    end;
  end if;

  return query
  with
    q as (select normalizar_concepto(p_concepto) as c),
    palabras as (
      select distinct w
      from q, regexp_split_to_table(coalesce(q.c, ''), ' ') as w
      where length(w) >= 3
        and w not in ('devolucion', 'devoluciones', 'devuelto', 'devuelta', 'reembolso', 'abono', 'bizum',
                      'transferencia', 'pago', 'compra', 'del', 'las', 'los', 'por', 'para', 'con', 'una', 'uno')
    ),
    nq as (select count(*)::numeric as n from palabras),
    g as (
      select m.id, m.fecha, m.concepto, m.comercio, m.importe, m.categoria_id, m.cuenta_id, m.created_at,
             m.importe - coalesce((select sum(d.importe) from movimientos d
                                   where d.devolucion_de = m.id and d.user_id = m.user_id
                                     and (p_excluir is null or d.id <> p_excluir)), 0.00) as pendiente,
             coalesce(normalizar_concepto(m.concepto), '') as nc,
             coalesce(normalizar_concepto(m.comercio), '') as ncom
      from movimientos m
      where m.user_id = auth.uid() and m.tipo = 'gasto'
        and (p_fecha is null or m.fecha <= p_fecha or m.id = v_actual)
    ),
    candidatos as (
      select g.*
      from g
      where (g.pendiente > 0 or g.id = v_actual)
        and (v_q is null
             or (v_q_texto is not null and (g.nc like '%' || v_q_texto || '%' or g.ncom like '%' || v_q_texto || '%'))
             or (v_q_importe is not null and (g.importe = v_q_importe or g.pendiente = v_q_importe))
             or (v_q_fecha is not null and g.fecha = v_q_fecha)
             or (v_q_dia is not null and extract(day from g.fecha) = v_q_dia and extract(month from g.fecha) = v_q_mes))
    ),
    puntos as (
      select c.*,
             case
               when q.c is null or nq.n = 0 then 0::numeric
               when c.nc = q.c or c.ncom = q.c then 1::numeric
               else (select count(*) from palabras p
                     where exists (select 1 from regexp_split_to_table(c.nc || ' ' || c.ncom, ' ') as gw
                                   where length(gw) >= 3
                                     and (gw = p.w or gw like p.w || '%' or p.w like gw || '%')))::numeric / nq.n
             end as s_texto,
             case
               when v_importe is null or c.pendiente < v_importe then 0::numeric
               when c.pendiente = v_importe or c.importe = v_importe then 1::numeric
               else v_importe / c.pendiente
             end as s_importe,
             case
               when p_fecha is null or c.fecha > p_fecha then 0::numeric
               else 1::numeric / (1 + (p_fecha - c.fecha)::numeric / 7)
             end as s_fecha,
             v_importe is not null and (c.pendiente = v_importe or c.importe = v_importe) as exacto
      from candidatos c, q, nq
    )
  select p.id, p.fecha, p.concepto, p.comercio, p.importe, p.pendiente, p.categoria_id, p.cuenta_id,
         round(50 * p.s_texto + 35 * p.s_importe + 15 * p.s_fecha)::int,
         case
           when p.exacto then 'importe_exacto'
           when p.s_texto >= 0.5 then 'concepto_parecido'
           when p.s_importe >= 0.5 then 'importe_parecido'
           when p_fecha is not null and p.fecha >= p_fecha - 7 then 'fecha_cercana'
           else 'reciente'
         end
  from puntos p
  order by round(50 * p.s_texto + 35 * p.s_importe + 15 * p.s_fecha) desc, p.fecha desc, p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limite, 20), 1), 100);
end $$;

drop function gastos_devolvibles(uuid, integer);


-- ---------------------------------------------------------------- 7. Atajo: las devoluciones se registran en la web
-- Igual que en 20261024000002_analisis_config.sql salvo el paso 3: una
-- devolución necesita su gasto original y el atajo todavía no permite elegirlo
-- (sección 9). create or replace conserva los permisos (anon y authenticated).
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
  -- Una devolución necesita su gasto original, que el atajo no permite elegir (sección 9).
  if v_tipo = 'devolucion' then
    return json_build_object('ok', false, 'error',
      'Las devoluciones se registran desde el formulario de Kapital, para vincularlas a su gasto original.');
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

  -- 6. Categoría (por nombre o, en las de por defecto, por clave o nombre traducido; sin importar mayúsculas)
  if v_tipo in ('gasto', 'ingreso', 'devolucion') then
    -- Por nombre; si es una categoría por defecto, también por su clave o su
    -- nombre en es/en/ca. Si dos casan, gana la que se llama exactamente así.
    select c.id, c.nombre into v_cat, v_cat_nom
    from categorias c
    where c.user_id = v_user and not c.archivada
      and c.tipo = (case when v_tipo = 'ingreso' then 'ingreso' else 'gasto' end)::tipo_categoria
      and (lower(c.nombre) = lower(coalesce(v_cat_in, ''))
           or (c.clave is not null and lower(coalesce(v_cat_in, '')) in (
                 lower(c.clave), lower(replace(c.clave, '_', ' ')),
                 lower(traduccion_categoria(c.clave, 'es')),
                 lower(traduccion_categoria(c.clave, 'en')),
                 lower(traduccion_categoria(c.clave, 'ca')))))
    order by (lower(c.nombre) = lower(coalesce(v_cat_in, ''))) desc, c.orden, c.nombre
    limit 1;
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
-- Supabase concede EXECUTE a PUBLIC y anon sobre toda función nueva. Las de
-- trigger no las llama nadie directamente; buscar_gastos_devolvibles es
-- security invoker (RLS + auth.uid()) y solo la usa la app con sesión.
revoke execute on function
  validar_devolucion(),
  heredar_categoria_devoluciones(),
  proteger_gasto_con_devoluciones(),
  buscar_gastos_devolvibles(text, text, date, text, uuid, integer)
from public, anon, authenticated;

grant execute on function
  buscar_gastos_devolvibles(text, text, date, text, uuid, integer)
to authenticated;
