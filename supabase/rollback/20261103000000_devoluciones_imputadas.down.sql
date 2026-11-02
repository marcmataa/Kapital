-- Rollback de 20261103000000_devoluciones_imputadas.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
--
-- Vuelve a las definiciones anteriores, copiadas tal cual:
--   resumen_periodo y gasto_por_categoria   (20261015000000_esquema_inicial.sql)
--   gasto_por_dia                           (20261020000000_correcciones.sql)
--   movimientos_por_dia                     (20261023000002_estadisticas.sql)
--   media_gasto_categoria                   (20261024000001_movimientos_ux.sql)
--   variacion_patrimonial y datos_analisis  (20261024000002_analisis_config.sql)
-- create or replace conserva los permisos; variacion_patrimonial cambia de
-- firma (pierde devoluciones_desplazadas): se borra y se crea con los mismos
-- permisos que tenía (solo authenticated). Al final se borra la vista.
--
-- Datos: a los análisis guardados se les quita variacion.devoluciones_desplazadas
-- (la forma anterior del snapshot). El resto de sus cifras se queda como se
-- calculó; regenerarlos los vuelve a calcular por la fecha real.

update analisis_mensuales a
   set datos = a.datos #- '{variacion,devoluciones_desplazadas}'
 where jsonb_typeof(a.datos -> 'variacion') = 'object'
   and a.datos -> 'variacion' ? 'devoluciones_desplazadas';


-- ---------------------------------------------------------------- 20261015000000_esquema_inicial.sql
create or replace function resumen_periodo(p_desde date, p_hasta date)
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

create or replace function gasto_por_categoria(p_desde date, p_hasta date)
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


-- ---------------------------------------------------------------- 20261020000000_correcciones.sql
create or replace function gasto_por_dia(p_desde date, p_hasta date)
returns table (fecha date, gasto_neto numeric)
language sql stable security invoker set search_path = public as $$
  select m.fecha, sum(case when m.tipo = 'gasto' then m.importe else -m.importe end)
  from movimientos m
  where m.user_id = auth.uid() and m.tipo in ('gasto', 'devolucion')
    and m.fecha between p_desde and p_hasta
  group by m.fecha
  order by m.fecha
$$;


-- ---------------------------------------------------------------- 20261023000002_estadisticas.sql
create or replace function movimientos_por_dia(p_desde date, p_hasta date)
returns table (fecha date, gastos numeric, devoluciones numeric, gasto_neto numeric, ingresos numeric,
               movimientos jsonb)
language sql stable security invoker set search_path = public as $$
  select m.fecha,
         coalesce(sum(m.importe) filter (where m.tipo = 'gasto'), 0.00),
         coalesce(sum(m.importe) filter (where m.tipo = 'devolucion'), 0.00),
         coalesce(sum(m.importe) filter (where m.tipo = 'gasto'), 0.00)
           - coalesce(sum(m.importe) filter (where m.tipo = 'devolucion'), 0.00),
         coalesce(sum(m.importe) filter (where m.tipo = 'ingreso'), 0.00),
         -- Importe como texto: en JSON un numeric sería un número (float en el cliente).
         jsonb_agg(
           jsonb_build_object('id', m.id, 'tipo', m.tipo, 'concepto', m.concepto, 'importe', m.importe::text)
           order by m.hora nulls last, m.created_at, m.id
         )
  from movimientos m
  where m.user_id = auth.uid() and m.tipo in ('gasto', 'devolucion', 'ingreso')
    and m.fecha between p_desde and p_hasta
  group by m.fecha
  order by m.fecha
$$;


-- ---------------------------------------------------------------- 20261024000001_movimientos_ux.sql
create or replace function media_gasto_categoria(p_categoria uuid, p_meses integer default 3)
returns table (media numeric, meses integer)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_mes_actual date := date_trunc('month', hoy_usuario())::date;
  v_inicio     date;
  v_desde      date;
  v_meses      int;
begin
  select min(c.fecha_inicial) into v_inicio from cuentas c where c.user_id = auth.uid();
  if v_inicio is null then
    return query select null::numeric, 0;
    return;
  end if;
  v_inicio := case when extract(day from v_inicio) = 1 then v_inicio
                   else (date_trunc('month', v_inicio) + interval '1 month')::date end;
  v_desde := greatest((v_mes_actual - make_interval(months => least(greatest(coalesce(p_meses, 3), 1), 24)))::date, v_inicio);
  v_meses := (extract(year from age(v_mes_actual, v_desde)) * 12 + extract(month from age(v_mes_actual, v_desde)))::int;
  if v_meses <= 0 then
    return query select null::numeric, 0;
    return;
  end if;
  return query
    select coalesce(sum(case when m.tipo = 'gasto' then m.importe else -m.importe end), 0.00) / v_meses, v_meses
    from movimientos m
    where m.user_id = auth.uid() and m.categoria_id = p_categoria and m.tipo in ('gasto', 'devolucion')
      and m.fecha >= v_desde and m.fecha < v_mes_actual;
end $$;


-- ---------------------------------------------------------------- 20261024000002_analisis_config.sql
drop function variacion_patrimonial(date, date);

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
  select p.ini + nuevas.s, p.fin, r.balance, inv.reval, r.ajustes, nuevas.s, p.fin - (p.ini + nuevas.s)
  from p, r, inv, nuevas
$$;

revoke execute on function variacion_patrimonial(date, date) from public, anon, authenticated;
grant execute on function variacion_patrimonial(date, date) to authenticated;

create or replace function datos_analisis(p_mes date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid         uuid := auth.uid();
  v_mes         date;
  v_fin         date;
  v_ant         date;
  v_ant_fin     date;
  v_hoy         date;
  v_inicio      date;
  v_idioma      text;
  v_anterior    boolean;
  v_r           record;
  v_categorias  jsonb;
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
  v_idioma := coalesce(v_idioma, 'es');
  select min(c.fecha_inicial) into v_inicio from cuentas c where c.user_id = v_uid;
  select * into v_r from resumen_periodo(v_mes, v_fin);
  v_anterior := coalesce(v_inicio <= v_ant, false);

  select coalesce(jsonb_agg(
           jsonb_build_object('nombre', g.nombre, 'clave', g.clave, 'etiqueta', g.etiqueta,
                              'color', g.color, 'gasto', g.gasto::text)
           order by g.gasto desc, g.nombre), '[]'::jsonb)
    into v_categorias
  from (
    select left(x.nombre, 40) as nombre, c.clave,
           left(coalesce(traduccion_categoria(c.clave, v_idioma), x.nombre), 40) as etiqueta,
           case when x.color ~ '^#[0-9A-Fa-f]{6}$' then x.color end as color,
           x.gasto
    from gasto_por_categoria(v_mes, v_fin) x
    join categorias c on c.id = x.categoria_id and c.user_id = v_uid
    order by x.gasto desc, x.nombre
    limit 200
  ) g;

  return jsonb_build_object(
    'mes',            to_char(v_mes, 'YYYY-MM-DD'),
    'mes_incompleto', coalesce(v_inicio > v_mes, true),
    'idioma',         v_idioma,

    'resumen', jsonb_build_object(
      'ingresos', v_r.ingresos::text, 'gastos', v_r.gastos::text, 'devoluciones', v_r.devoluciones::text,
      'gastos_netos', v_r.gastos_netos::text, 'balance', v_r.balance::text,
      'ahorro_pct', v_r.ahorro_pct::text, 'ajustes', v_r.ajustes::text),

    'resumen_mes_anterior', (
      select jsonb_build_object(
        'ingresos', r.ingresos::text, 'gastos', r.gastos::text, 'devoluciones', r.devoluciones::text,
        'gastos_netos', r.gastos_netos::text, 'balance', r.balance::text,
        'ahorro_pct', r.ahorro_pct::text, 'ajustes', r.ajustes::text)
      from resumen_periodo(v_ant, v_ant_fin) r
      where v_anterior),

    'categorias', v_categorias,

    'categorias_mes_anterior', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', g.nombre, 'clave', g.clave, 'etiqueta', g.etiqueta,
                                  'color', g.color, 'gasto', g.gasto::text)
               order by g.gasto desc, g.nombre), '[]'::jsonb)
      from (
        select left(x.nombre, 40) as nombre, c.clave,
               left(coalesce(traduccion_categoria(c.clave, v_idioma), x.nombre), 40) as etiqueta,
               case when x.color ~ '^#[0-9A-Fa-f]{6}$' then x.color end as color,
               x.gasto
        from gasto_por_categoria(v_ant, v_ant_fin) x
        join categorias c on c.id = x.categoria_id and c.user_id = v_uid
        where v_anterior
        order by x.gasto desc, x.nombre
        limit 200
      ) g),

    'comparativa_categorias', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', k.nombre, 'clave', k.clave, 'etiqueta', k.etiqueta,
                                  'gasto', k.gasto::text, 'gasto_anterior', k.gasto_anterior::text,
                                  'diferencia', k.diferencia::text,
                                  'variacion_pct', variacion_porcentual(k.gasto, k.gasto_anterior)::text)
               order by abs(k.diferencia) desc, k.nombre), '[]'::jsonb)
      from (
        select left(c.nombre, 40) as nombre, c.clave,
               left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40) as etiqueta,
               coalesce(a.gasto, 0.00) as gasto,
               coalesce(p.gasto, 0.00) as gasto_anterior,
               coalesce(a.gasto, 0.00) - coalesce(p.gasto, 0.00) as diferencia
        from gasto_por_categoria(v_mes, v_fin) a
        full join gasto_por_categoria(v_ant, v_ant_fin) p using (categoria_id)
        join categorias c on c.id = categoria_id and c.user_id = v_uid
        where v_anterior
        order by abs(coalesce(a.gasto, 0.00) - coalesce(p.gasto, 0.00)) desc, c.nombre
        limit 10
      ) k),

    'mayor_gasto', (
      select jsonb_build_object(
               'importe', m.importe::text,
               'fecha', to_char(m.fecha, 'YYYY-MM-DD'),
               'dia_semana', to_char(m.fecha, 'ID'),
               'categoria', left(c.nombre, 40),
               'clave', c.clave,
               'etiqueta', left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40),
               'pct_gastos', case when v_r.gastos > 0 then (m.importe / v_r.gastos * 100)::text end)
      from movimientos m
      left join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
      where m.user_id = v_uid and m.tipo = 'gasto' and m.fecha between v_mes and v_fin
      order by m.importe desc, m.fecha, m.created_at, m.id
      limit 1),

    'fin_de_semana', (
      select jsonb_build_object(
               'gasto_neto', f.total::text,
               'pct', case when v_r.gastos_netos > 0 then (f.total / v_r.gastos_netos * 100)::text end,
               'dias', f.dias::text,
               'dias_mes', (v_fin - v_mes + 1)::text,
               'categorias', f.categorias)
      from (
        select
          coalesce((
            select sum(case when m.tipo = 'gasto' then m.importe else -m.importe end)
            from movimientos m
            where m.user_id = v_uid and m.tipo in ('gasto', 'devolucion')
              and m.fecha between v_mes and v_fin and extract(isodow from m.fecha) in (6, 7)), 0.00) as total,
          (select count(*) from generate_series(v_mes::timestamp, v_fin::timestamp, interval '1 day') d
           where extract(isodow from d) in (6, 7)) as dias,
          (select coalesce(jsonb_agg(
                    jsonb_build_object('nombre', w.nombre, 'clave', w.clave, 'etiqueta', w.etiqueta,
                                       'gasto_fin_de_semana', w.fds::text, 'gasto', w.total::text,
                                       'pct', (w.fds / w.total * 100)::text)
                    order by w.fds desc, w.nombre), '[]'::jsonb)
           from (
             select left(c.nombre, 40) as nombre, c.clave,
                    left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40) as etiqueta,
                    sum(case when extract(isodow from m.fecha) in (6, 7)
                             then case when m.tipo = 'gasto' then m.importe else -m.importe end
                             else 0 end) as fds,
                    sum(case when m.tipo = 'gasto' then m.importe else -m.importe end) as total
             from movimientos m
             join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
             where m.user_id = v_uid and m.tipo in ('gasto', 'devolucion') and m.fecha between v_mes and v_fin
             group by c.id
             having sum(case when m.tipo = 'gasto' then m.importe else -m.importe end) > 0
                and sum(case when extract(isodow from m.fecha) in (6, 7)
                             then case when m.tipo = 'gasto' then m.importe else -m.importe end
                             else 0 end) > 0
             order by 4 desc, 1
             limit 5
           ) w) as categorias
      ) f),

    'metodos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('metodo', g.metodo::text, 'gasto', g.gasto::text)
               order by g.gasto desc, g.metodo::text), '[]'::jsonb)
      from gasto_por_metodo(v_mes, v_fin) g),

    'variacion', (
      select jsonb_build_object(
        'patrimonio_inicial', v.patrimonio_inicial::text, 'patrimonio_final', v.patrimonio_final::text,
        'balance', v.balance::text, 'revalorizacion', v.revalorizacion::text, 'ajustes', v.ajustes::text,
        'saldos_iniciales', v.saldos_iniciales::text, 'variacion', v.variacion::text, 'base', 'partida')
      from variacion_patrimonial(v_mes - 1, least(v_fin, v_hoy)) v),

    'cascada', cascada_analisis(v_r.ingresos, v_r.gastos_netos, v_categorias),

    'objetivos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('tipo', o.tipo, 'categoria', o.categoria, 'clave', o.clave,
                                  'etiqueta', o.etiqueta, 'importe', o.importe, 'actual', o.actual)
               order by o.tipo, o.categoria), '[]'::jsonb)
      from (
        select ob.tipo::text as tipo,
               left(c.nombre, 40) as categoria,
               c.clave,
               left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40) as etiqueta,
               ob.importe::text as importe,
               case when ob.tipo = 'ahorro_mensual' then v_r.balance::text
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


-- ---------------------------------------------------------------- Vista de la imputación
drop view v_movimientos_imputados;
