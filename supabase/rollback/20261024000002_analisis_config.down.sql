-- Rollback de 20261024000002_analisis_config.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va antes que los
-- de las migraciones anteriores.
--
-- Vuelve a las versiones anteriores de variacion_patrimonial (esquema inicial),
-- datos_analisis (20261020000000_correcciones.sql) y registrar_movimiento
-- (esquema inicial). create or replace conserva los permisos.
--
-- Datos: los análisis guardados con la variación nueva (variacion.base =
-- 'partida') vuelven a la base antigua y se quitan las claves nuevas del
-- snapshot. El texto de la IA (contenido) no se toca: los análisis generados
-- con la versión nueva conservan su formato (observaciones y recomendaciones
-- con acción) y habría que regenerarlos con la Edge Function anterior.

update analisis_mensuales a
   set datos = jsonb_set(
                 jsonb_set(a.datos, '{variacion,patrimonio_inicial}',
                   to_jsonb(((a.datos #>> '{variacion,patrimonio_inicial}')::numeric
                             - (a.datos #>> '{variacion,saldos_iniciales}')::numeric)::text)),
                 '{variacion,variacion}',
                 to_jsonb(((a.datos #>> '{variacion,variacion}')::numeric
                           + (a.datos #>> '{variacion,saldos_iniciales}')::numeric)::text))
               #- '{variacion,base}'
 where a.datos #>> '{variacion,base}' = 'partida'
   and coalesce(a.datos #>> '{variacion,patrimonio_inicial}', '') ~ '^-?\d+(\.\d+)?$'
   and coalesce(a.datos #>> '{variacion,saldos_iniciales}', '') ~ '^-?\d+(\.\d+)?$'
   and coalesce(a.datos #>> '{variacion,variacion}', '') ~ '^-?\d+(\.\d+)?$';

update analisis_mensuales a
   set datos = a.datos - array['cascada', 'comparativa_categorias', 'mayor_gasto', 'fin_de_semana']
 where jsonb_typeof(a.datos) = 'object'
   and a.datos ?| array['cascada', 'comparativa_categorias', 'mayor_gasto', 'fin_de_semana'];

create or replace function variacion_patrimonial(p_d1 date, p_d2 date)
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

create or replace function datos_analisis(p_mes date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_mes       date;
  v_fin       date;
  v_ant       date;
  v_ant_fin   date;
  v_hoy       date;
  v_inicio    date;
  v_idioma    text;
  v_balance   numeric;
  v_anterior  boolean;
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
  v_anterior := coalesce(v_inicio <= v_ant, false);

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
      from resumen_periodo(v_ant, v_ant_fin) r
      where v_anterior),

    'categorias', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', g.nombre, 'color', g.color, 'gasto', g.gasto::text)
               order by g.gasto desc, g.nombre), '[]'::jsonb)
      from (
        select left(x.nombre, 40) as nombre,
               case when x.color ~ '^#[0-9A-Fa-f]{6}$' then x.color end as color,
               x.gasto
        from gasto_por_categoria(v_mes, v_fin) x
        order by x.gasto desc, x.nombre
        limit 200
      ) g),

    'categorias_mes_anterior', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', g.nombre, 'color', g.color, 'gasto', g.gasto::text)
               order by g.gasto desc, g.nombre), '[]'::jsonb)
      from (
        select left(x.nombre, 40) as nombre,
               case when x.color ~ '^#[0-9A-Fa-f]{6}$' then x.color end as color,
               x.gasto
        from gasto_por_categoria(v_ant, v_ant_fin) x
        where v_anterior
        order by x.gasto desc, x.nombre
        limit 200
      ) g),

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
               jsonb_build_object('tipo', o.tipo, 'categoria', o.categoria, 'importe', o.importe, 'actual', o.actual)
               order by o.tipo, o.categoria), '[]'::jsonb)
      from (
        select ob.tipo::text as tipo,
               left(c.nombre, 40) as categoria,
               ob.importe::text as importe,
               case when ob.tipo = 'ahorro_mensual' then v_balance::text
                    else coalesce(g.gasto, 0.00)::text end as actual
        from objetivos ob
        left join categorias c on c.id = ob.categoria_id and c.user_id = ob.user_id
        left join gasto_por_categoria(v_mes, v_fin) g on g.categoria_id = ob.categoria_id
        where ob.user_id = v_uid and ob.activo
        order by ob.tipo, c.nombre
        limit 50
      ) o)
  );
end $$;

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

drop function if exists cascada_analisis(numeric, numeric, jsonb);
drop function if exists traduccion_categoria(text, text);
