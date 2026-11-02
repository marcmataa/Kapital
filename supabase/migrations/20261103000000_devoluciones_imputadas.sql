-- =====================================================================
--  Kapital · Devoluciones imputadas a su compra (M1)
--
--  Reglas:   docs/reglas-financieras.md, secciones 3 («Devoluciones: fecha
--            real e imputación»), 5 («Devoluciones desplazadas»), 7, 8 y 11.
--  Rollback: supabase/rollback/20261103000000_devoluciones_imputadas.down.sql
--  Tests:    tests/db/devoluciones-imputadas.test.ts (+ reglas-financieras,
--            invariantes, estadisticas, analisis-config, seguridad)
--
--  Una devolución tiene dos fechas que no se mezclan:
--    · fecha real (movimientos.fecha): saldo de las cuentas, patrimonio, lista
--      de movimientos y sus totales (Entradas/Salidas/Neto). NO cambia aquí:
--      v_efectos, v_saldos, valor_cuenta, patrimonio, serie_patrimonio,
--      valores_cuentas, movimientos_filtrados, totales_por_tipo,
--      subtotales_por_dia, resumen_filtro y gasto_por_metodo (sección 8: los
--      métodos de pago no restan devoluciones) siguen igual.
--    · imputación: una devolución VINCULADA (devolucion_de no nulo) resta en el
--      día, el mes y la categoría de su compra. Las antiguas SIN vincular
--      siguen restando en su propia fecha y categoría (y pueden dejar una
--      categoría en negativo, sección 8).
--
--   1. v_movimientos_imputados (security invoker): cada movimiento con su
--      fecha_imputada y su categoria_imputada. Es la única pieza que decide la
--      imputación; las funciones de abajo la usan en lugar de `movimientos`.
--   2. Gasto y balance por la imputación (mismas firmas: create or replace
--      conserva los permisos):
--        resumen_periodo, gasto_por_categoria, gasto_por_dia,
--        movimientos_por_dia, media_gasto_categoria y datos_analisis
--        (fin de semana por el día de la compra).
--      Las que se apoyan en ellas cambian solas, sin tocarlas: resumen_mensual,
--      comparativa_estadisticas, ritmo_gasto, progreso_objetivos,
--      peso_otros_gastos y la cascada y los objetivos de datos_analisis.
--   3. variacion_patrimonial: nueva pieza devoluciones_desplazadas (sección 5):
--        ΔPatrimonio = Balance + Devoluciones desplazadas + Revalorización + Ajustes
--        Desplazadas = Σ vinculadas con fecha real en (D1, D2] y compra fuera
--                    − Σ vinculadas con compra en (D1, D2] y fecha real fuera
--      Cambia la firma (una columna más): se borra y se crea de nuevo, con los
--      mismos permisos (solo authenticated).
--   4. datos_analisis guarda `variacion.devoluciones_desplazadas` (texto). Los
--      análisis ya guardados no se tocan: se calcularon por la fecha real, así
--      que para ellos la pieza vale 0 (el cliente y la Edge Function la leen
--      como opcional, '0.00' por defecto).
--
--  Permisos: Supabase concede todo a anon y authenticated sobre lo nuevo en
--  public. La vista solo se lee (authenticated) y variacion_patrimonial solo la
--  ejecuta authenticated.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Efecto imputado de cada movimiento
-- fecha_imputada / categoria_imputada: las de la compra si es una devolución
-- vinculada; las propias en cualquier otro caso. security invoker: RLS se
-- aplica a las dos lecturas de movimientos. `fecha` y `categoria_id` son las
-- reales (sin cambios).
create view v_movimientos_imputados with (security_invoker = true) as
  select m.id, m.user_id, m.tipo, m.importe, m.sentido, m.metodo, m.concepto, m.hora, m.created_at,
         m.fecha, m.categoria_id, m.devolucion_de,
         coalesce(g.fecha, m.fecha) as fecha_imputada,
         case when g.id is not null then g.categoria_id else m.categoria_id end as categoria_imputada
  from movimientos m
  left join movimientos g
    on m.tipo = 'devolucion' and g.id = m.devolucion_de and g.user_id = m.user_id;

revoke all on v_movimientos_imputados from public, anon, authenticated;
grant select on v_movimientos_imputados to authenticated;


-- ---------------------------------------------------------------- 2. Balance de un periodo
-- Igual que en el esquema inicial, pero por la fecha imputada (sección 3):
-- `devoluciones` son las imputadas al periodo (vinculadas a compras del
-- periodo + antiguas sin vincular con fecha en el periodo).
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
    from v_movimientos_imputados m
    where m.user_id = auth.uid() and m.fecha_imputada between p_desde and p_hasta
  )
  select t.ingresos, t.gastos, t.devoluciones,
         t.gastos - t.devoluciones,
         t.ingresos - (t.gastos - t.devoluciones),
         case when t.ingresos > 0 then (t.ingresos - (t.gastos - t.devoluciones)) / t.ingresos * 100 end,
         t.ajustes
  from t
$$;


-- ---------------------------------------------------------------- 2. Gasto por categoría
-- Gasto neto por categoría (sección 8): gastos − devoluciones imputadas. Una
-- devolución vinculada resta en la categoría y el mes de su compra, así que
-- solo las antiguas sin vincular pueden dejar una categoría en negativo.
create or replace function gasto_por_categoria(p_desde date, p_hasta date)
returns table (categoria_id uuid, nombre text, color text, icono text, gasto numeric)
language sql stable set search_path = public as $$
  select c.id, c.nombre, c.color, c.icono,
         sum(case when m.tipo = 'gasto' then m.importe else -m.importe end)
  from v_movimientos_imputados m
  join categorias c on c.id = m.categoria_imputada and c.user_id = m.user_id
  where m.user_id = auth.uid() and m.tipo in ('gasto', 'devolucion')
    and m.fecha_imputada between p_desde and p_hasta
  group by c.id
$$;


-- ---------------------------------------------------------------- 2. Gasto por día
-- Gasto neto de cada día (secciones 3 y 8): Σ gastos − Σ devoluciones
-- imputadas a ese día. Una devolución vinculada resta el día de su compra, que
-- nunca queda en negativo por ella (lo devuelto no supera el gasto). Solo días
-- con gastos o devoluciones; traspasos y ajustes no entran.
create or replace function gasto_por_dia(p_desde date, p_hasta date)
returns table (fecha date, gasto_neto numeric)
language sql stable security invoker set search_path = public as $$
  select m.fecha_imputada, sum(case when m.tipo = 'gasto' then m.importe else -m.importe end)
  from v_movimientos_imputados m
  where m.user_id = auth.uid() and m.tipo in ('gasto', 'devolucion')
    and m.fecha_imputada between p_desde and p_hasta
  group by m.fecha_imputada
  order by m.fecha_imputada
$$;


-- ---------------------------------------------------------------- 2. Detalle por día (Estadísticas)
-- Igual que en 20261023000002_estadisticas.sql, por el día imputado: la
-- devolución vinculada sale (y resta) en el día de su compra, junto al gasto
-- que devuelve. Los ingresos siguen en su fecha.
create or replace function movimientos_por_dia(p_desde date, p_hasta date)
returns table (fecha date, gastos numeric, devoluciones numeric, gasto_neto numeric, ingresos numeric,
               movimientos jsonb)
language sql stable security invoker set search_path = public as $$
  select m.fecha_imputada,
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
  from v_movimientos_imputados m
  where m.user_id = auth.uid() and m.tipo in ('gasto', 'devolucion', 'ingreso')
    and m.fecha_imputada between p_desde and p_hasta
  group by m.fecha_imputada
  order by m.fecha_imputada
$$;


-- ---------------------------------------------------------------- 2. Media mensual de una categoría
-- Igual que en 20261024000001_movimientos_ux.sql, con las devoluciones
-- imputadas a la categoría y al mes de su compra (sección 8: la media puede
-- cambiar si llega una devolución de una compra de un mes ya cerrado).
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
    from v_movimientos_imputados m
    where m.user_id = auth.uid() and m.categoria_imputada = p_categoria and m.tipo in ('gasto', 'devolucion')
      and m.fecha_imputada >= v_desde and m.fecha_imputada < v_mes_actual;
end $$;


-- ---------------------------------------------------------------- 3. Variación patrimonial
-- Igual que en 20261024000002_analisis_config.sql, con la pieza de
-- conciliación devoluciones_desplazadas (sección 5). El patrimonio usa la
-- fecha real y el balance la de la compra; la diferencia entre los dos es
-- exactamente esta pieza, así que siempre se cumple
--   variacion = balance + devoluciones_desplazadas + revalorizacion + ajustes
-- (con el saldo inicial de las cuentas nuevas dentro del patrimonio de partida).
-- Una devolución con compra y reembolso dentro del periodo no entra; una que
-- cruza de periodo sale con el mismo importe y signo contrario en cada uno.
drop function variacion_patrimonial(date, date);

create function variacion_patrimonial(p_d1 date, p_d2 date)
returns table (patrimonio_inicial numeric, patrimonio_final numeric, balance numeric,
               devoluciones_desplazadas numeric, revalorizacion numeric, ajustes numeric,
               saldos_iniciales numeric, variacion numeric)
language sql stable set search_path = public as $$
  with
    r as (select * from resumen_periodo(p_d1 + 1, p_d2)),
    desp as (
      select coalesce(sum(case when m.fecha > p_d1 and m.fecha <= p_d2 then m.importe else 0 end)
                    - sum(case when m.fecha_imputada > p_d1 and m.fecha_imputada <= p_d2 then m.importe else 0 end),
                      0.00) as d
      from v_movimientos_imputados m
      where m.user_id = auth.uid() and m.tipo = 'devolucion' and m.fecha_imputada <> m.fecha
    ),
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
  select p.ini + nuevas.s, p.fin, r.balance, desp.d, inv.reval, r.ajustes, nuevas.s, p.fin - (p.ini + nuevas.s)
  from p, r, desp, inv, nuevas
$$;


-- ---------------------------------------------------------------- 4. datos_analisis
-- Igual que en 20261024000002_analisis_config.sql, con:
--   · fin_de_semana por el día y la categoría imputados (una devolución
--     vinculada resta el día de su compra);
--   · variacion.devoluciones_desplazadas (texto).
-- Resumen, categorías, comparativa, cascada y objetivos ya salen imputados de
-- resumen_periodo y gasto_por_categoria. mayor_gasto y metodos no cambian.
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
            from v_movimientos_imputados m
            where m.user_id = v_uid and m.tipo in ('gasto', 'devolucion')
              and m.fecha_imputada between v_mes and v_fin
              and extract(isodow from m.fecha_imputada) in (6, 7)), 0.00) as total,
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
                    sum(case when extract(isodow from m.fecha_imputada) in (6, 7)
                             then case when m.tipo = 'gasto' then m.importe else -m.importe end
                             else 0 end) as fds,
                    sum(case when m.tipo = 'gasto' then m.importe else -m.importe end) as total
             from v_movimientos_imputados m
             join categorias c on c.id = m.categoria_imputada and c.user_id = m.user_id
             where m.user_id = v_uid and m.tipo in ('gasto', 'devolucion')
               and m.fecha_imputada between v_mes and v_fin
             group by c.id
             having sum(case when m.tipo = 'gasto' then m.importe else -m.importe end) > 0
                and sum(case when extract(isodow from m.fecha_imputada) in (6, 7)
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
        'balance', v.balance::text, 'devoluciones_desplazadas', v.devoluciones_desplazadas::text,
        'revalorizacion', v.revalorizacion::text, 'ajustes', v.ajustes::text,
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


-- ---------------------------------------------------------------- Permisos de funciones
-- Solo variacion_patrimonial es nueva (drop + create); el resto conserva sus
-- permisos con create or replace.
revoke execute on function variacion_patrimonial(date, date) from public, anon, authenticated;
grant execute on function variacion_patrimonial(date, date) to authenticated;
