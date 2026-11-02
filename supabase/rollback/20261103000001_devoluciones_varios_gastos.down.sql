-- Rollback de 20261103000001_devoluciones_varios_gastos.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
-- Las filas creadas por registrar_devoluciones se conservan (cada devolución
-- sigue vinculada a su gasto y el ingreso del sobrante sigue siendo un
-- ingreso); solo se pierde la columna grupo_devolucion, que las agrupaba.
-- buscar_gastos_devolvibles vuelve a ser la de
-- 20261102000001_devoluciones_vinculadas.sql (create or replace conserva los
-- permisos).

drop function if exists registrar_devoluciones(date, uuid, text, text, text, jsonb, text, uuid);

drop trigger if exists movimientos_grupo_devolucion on movimientos;
drop function if exists salir_de_grupo_devolucion();
drop index if exists movimientos_grupo_devolucion_idx;
alter table movimientos drop constraint if exists grupo_devolucion_solo_devolucion_ingreso;
alter table movimientos drop column if exists grupo_devolucion;

-- buscar_gastos_devolvibles, como en 20261102000001_devoluciones_vinculadas.sql.
create or replace function buscar_gastos_devolvibles(
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
