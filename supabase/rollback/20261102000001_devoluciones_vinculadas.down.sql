-- Rollback de 20261102000001_devoluciones_vinculadas.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
-- No toca datos: las devoluciones creadas con esta migración conservan su
-- vínculo y su categoría. Quita los triggers nuevos, devuelve a la clave
-- foránea el «on delete set null», recupera gastos_devolvibles y deja
-- registrar_movimiento como en 20261024000002_analisis_config.sql (el atajo
-- vuelve a aceptar devoluciones sin vínculo).

drop function if exists buscar_gastos_devolvibles(text, text, date, text, uuid, integer);

drop trigger if exists movimientos_proteger_gasto on movimientos;
drop trigger if exists movimientos_devoluciones_categoria on movimientos;
drop trigger if exists movimientos_devolucion on movimientos;
drop function if exists proteger_gasto_con_devoluciones();
drop function if exists heredar_categoria_devoluciones();
drop function if exists validar_devolucion();

alter table movimientos drop constraint if exists movimientos_devolucion_de_user_id_fkey;
alter table movimientos add constraint movimientos_devolucion_de_user_id_fkey
  foreign key (devolucion_de, user_id) references movimientos (id, user_id) on delete set null (devolucion_de);

-- gastos_devolvibles, como en 20261024000001_movimientos_ux.sql.
create function gastos_devolvibles(p_excluir uuid default null, p_limite integer default 50)
returns table (id uuid, fecha date, concepto text, importe numeric, pendiente numeric,
               categoria_id uuid, cuenta_id uuid)
language sql stable security invoker set search_path = public as $$
  select g.id, g.fecha, g.concepto, g.importe,
         g.importe - coalesce((select sum(d.importe) from movimientos d
                               where d.devolucion_de = g.id and d.user_id = g.user_id
                                 and (p_excluir is null or d.id <> p_excluir)), 0.00),
         g.categoria_id, g.cuenta_id
  from movimientos g
  where g.user_id = auth.uid() and g.tipo = 'gasto'
    and g.importe > coalesce((select sum(d.importe) from movimientos d
                              where d.devolucion_de = g.id and d.user_id = g.user_id
                                and (p_excluir is null or d.id <> p_excluir)), 0.00)
  order by g.fecha desc, g.created_at desc, g.id desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

revoke execute on function gastos_devolvibles(uuid, integer) from public, anon, authenticated;
grant execute on function gastos_devolvibles(uuid, integer) to authenticated;

-- registrar_movimiento de 20261024000002_analisis_config.sql (create or replace
-- conserva los permisos).
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
