-- =====================================================================
--  Kapital · Estadísticas: detalle por día y comparativa con gasto medio
--
--  Reglas:   docs/reglas-financieras.md (secciones 3 y 8).
--  Rollback: supabase/rollback/20261023000002_estadisticas.down.sql
--  Tests:    tests/db/estadisticas.test.ts (+ seguridad)
--
--  1. movimientos_por_dia: por cada día con gastos, devoluciones o ingresos,
--     sus totales (gastos, devoluciones, gasto neto, ingresos) y la lista de
--     esos movimientos (concepto + importe como texto). Las devoluciones restan
--     del gasto; nunca se suman a los ingresos.
--  2. comparativa_estadisticas: gastos netos e ingresos de un tramo contra el
--     mismo tramo del mes anterior (variación con variacion_porcentual), gasto
--     medio diario (gastos netos / días del tramo) y el mayor gasto del tramo.
--     También el balance y su variación.
--  3. fuera_del_balance: traspasos (por par de cuentas) y ajustes (por cuenta y
--     sentido) de un periodo, para mostrarlos aparte del balance.
--
--  Todas son security invoker (RLS + auth.uid()). Supabase concede EXECUTE a
--  PUBLIC y anon sobre toda función nueva: se revoca y se concede solo a
--  authenticated.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Detalle por día
create function movimientos_por_dia(p_desde date, p_hasta date)
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


-- ---------------------------------------------------------------- 2. Comparativa y gasto medio diario
-- Tramo actual [p_desde, p_hasta] contra el anterior [p_desde_ant, p_hasta_ant]
-- (el cliente pasa tramos de la misma longitud, sección 8; NULL = no hay
-- tramo anterior y no hay variación). El gasto medio diario usa los días del
-- tramo: del día 1 a hoy en el mes en curso, el mes entero si está cerrado.
-- Precisión completa: se redondea al mostrar.
create function comparativa_estadisticas(p_desde date, p_hasta date, p_desde_ant date default null, p_hasta_ant date default null)
returns table (gastos_netos numeric, gastos_netos_anterior numeric, variacion_gastos numeric,
               ingresos numeric, ingresos_anterior numeric, variacion_ingresos numeric,
               balance numeric, balance_anterior numeric, variacion_balance numeric,
               dias integer, gasto_medio_diario numeric, mayor_concepto text, mayor_importe numeric)
language sql stable security invoker set search_path = public as $$
  with
    act as (select * from resumen_periodo(p_desde, p_hasta)),
    ant as (
      select r.* from resumen_periodo(p_desde_ant, p_hasta_ant) r
      where p_desde_ant is not null and p_hasta_ant is not null
    ),
    mayor as (
      select m.concepto, m.importe
      from movimientos m
      where m.user_id = auth.uid() and m.tipo = 'gasto' and m.fecha between p_desde and p_hasta
      order by m.importe desc, m.fecha, m.created_at, m.id
      limit 1
    )
  select act.gastos_netos,
         ant.gastos_netos,
         variacion_porcentual(act.gastos_netos, ant.gastos_netos),
         act.ingresos,
         ant.ingresos,
         variacion_porcentual(act.ingresos, ant.ingresos),
         act.balance,
         ant.balance,
         variacion_porcentual(act.balance, ant.balance),
         (p_hasta - p_desde + 1),
         act.gastos_netos / (p_hasta - p_desde + 1),
         mayor.concepto,
         mayor.importe
  from act
  left join ant on true
  left join mayor on true
  where p_hasta >= p_desde
$$;


-- ---------------------------------------------------------------- 3. Lo que no cuenta en el balance
-- Traspasos (uno por par de cuentas origen → destino) y ajustes (uno por
-- cuenta y sentido) de un periodo. Se muestran aparte: nunca entran en el
-- balance (secciones 2 y 3).
create function fuera_del_balance(p_desde date, p_hasta date)
returns table (tipo tipo_movimiento, cuenta text, cuenta_destino text, sentido sentido_ajuste, importe numeric)
language sql stable security invoker set search_path = public as $$
  select m.tipo, c.nombre, d.nombre, m.sentido, sum(m.importe)
  from movimientos m
  join cuentas c on c.id = m.cuenta_id and c.user_id = m.user_id
  left join cuentas d on d.id = m.cuenta_destino_id and d.user_id = m.user_id
  where m.user_id = auth.uid() and m.tipo in ('traspaso', 'ajuste')
    and m.fecha between p_desde and p_hasta
  group by m.tipo, c.nombre, d.nombre, m.sentido
  order by m.tipo = 'ajuste', sum(m.importe) desc, c.nombre, d.nombre
$$;


-- ---------------------------------------------------------------- Permisos de funciones
revoke execute on function
  movimientos_por_dia(date, date),
  comparativa_estadisticas(date, date, date, date),
  fuera_del_balance(date, date)
from public, anon, authenticated;

grant execute on function
  movimientos_por_dia(date, date),
  comparativa_estadisticas(date, date, date, date),
  fuera_del_balance(date, date)
to authenticated;
