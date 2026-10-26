-- =====================================================================
--  Kapital · Inicio y Estadísticas: objetivos con proyección, ritmo de
--  gasto y peso de «Otros gastos»
--
--  Reglas:   docs/reglas-financieras.md (secciones 3 y 8).
--  Rollback: supabase/rollback/20261024000003_inicio_estadisticas.down.sql
--  Tests:    tests/db/inicio-estadisticas.test.ts (+ seguridad)
--
--  1. progreso_objetivos: cada objetivo activo con lo que lleva el mes en
--     curso (balance de 1..hoy para el ahorro, gasto neto de su categoría
--     para un límite), cuánto se ha superado un límite, cuánto falta para el
--     ahorro, los días que quedan (hoy incluido) y el ahorro diario necesario.
--  2. ritmo_gasto: devoluciones del tramo, gasto medio diario del tramo y del
--     mismo tramo del mes anterior (con su variación) y proyección lineal del
--     gasto neto a fin de mes (solo si el tramo es un mes empezado el día 1 y
--     aún no ha terminado). Es una estimación: no es balance, ni patrimonio,
--     ni variación patrimonial.
--  3. peso_otros_gastos: gasto neto de la categoría «Otros gastos» (clave
--     otros_gastos) y su % sobre la suma de las categorías con gasto positivo
--     (la misma base que el gráfico circular, sección 8), y si supera el 20 %.
--
--  Todas son security invoker (RLS + auth.uid()). Supabase concede EXECUTE a
--  PUBLIC y anon sobre toda función nueva: se revoca y se concede solo a
--  authenticated. Precisión completa: se redondea al mostrar.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Objetivos del mes en curso
create function progreso_objetivos(p_hoy date default hoy_usuario())
returns table (objetivo_id uuid, tipo tipo_objetivo, categoria_id uuid, importe numeric, actual numeric,
               exceso numeric, restante numeric, dias_restantes integer, ahorro_diario_necesario numeric)
language sql stable security invoker set search_path = public as $$
  with
    mes as (
      select date_trunc('month', p_hoy::timestamp)::date as desde,
             (date_trunc('month', p_hoy::timestamp) + interval '1 month - 1 day')::date as fin
    ),
    r as (select rp.balance from mes cross join lateral resumen_periodo(mes.desde, p_hoy) rp),
    g as (select gc.categoria_id, gc.gasto from mes cross join lateral gasto_por_categoria(mes.desde, p_hoy) gc),
    o as (
      select o.id, o.tipo, o.categoria_id, o.importe, o.created_at,
             case o.tipo
               when 'ahorro_mensual' then (select r.balance from r)
               else coalesce((select g.gasto from g where g.categoria_id = o.categoria_id), 0.00)
             end as actual
      from objetivos o
      where o.user_id = auth.uid() and o.activo
    )
  select o.id, o.tipo, o.categoria_id, o.importe, o.actual,
         case when o.tipo = 'limite_categoria' and o.actual > o.importe then o.actual - o.importe end,
         case when o.tipo = 'ahorro_mensual' and o.actual < o.importe then o.importe - o.actual end,
         (mes.fin - p_hoy + 1),
         case when o.tipo = 'ahorro_mensual' and o.actual < o.importe
              then (o.importe - o.actual) / (mes.fin - p_hoy + 1) end
  from o cross join mes
  order by o.created_at, o.id
$$;


-- ---------------------------------------------------------------- 2. Ritmo de gasto y proyección
-- Tramo actual [p_desde, p_hasta] contra el anterior [p_desde_ant, p_hasta_ant]
-- (los mismos tramos que comparativa_estadisticas; NULL = no hay anterior).
create function ritmo_gasto(p_desde date, p_hasta date, p_desde_ant date default null, p_hasta_ant date default null)
returns table (devoluciones numeric, gasto_medio_diario numeric, gasto_medio_diario_anterior numeric,
               variacion_medio_diario numeric, dias_mes integer, proyeccion_fin_mes numeric)
language sql stable security invoker set search_path = public as $$
  with
    act as (select * from resumen_periodo(p_desde, p_hasta)),
    ant as (
      select r.* from resumen_periodo(p_desde_ant, p_hasta_ant) r
      where p_desde_ant is not null and p_hasta_ant is not null and p_hasta_ant >= p_desde_ant
    ),
    m as (
      select date_trunc('month', p_desde::timestamp)::date as inicio,
             (date_trunc('month', p_desde::timestamp) + interval '1 month - 1 day')::date as fin
    ),
    medias as (
      select act.devoluciones,
             act.gastos_netos,
             act.gastos_netos / (p_hasta - p_desde + 1) as actual,
             ant.gastos_netos / (p_hasta_ant - p_desde_ant + 1) as anterior
      from act left join ant on true
    )
  select medias.devoluciones,
         medias.actual,
         medias.anterior,
         variacion_porcentual(medias.actual, medias.anterior),
         (m.fin - m.inicio + 1),
         case when p_desde = m.inicio and p_hasta < m.fin
              then medias.gastos_netos * (m.fin - m.inicio + 1) / (p_hasta - p_desde + 1) end
  from medias cross join m
  where p_hasta >= p_desde and p_hasta <= m.fin
$$;


-- ---------------------------------------------------------------- 3. Peso de «Otros gastos»
create function peso_otros_gastos(p_desde date, p_hasta date)
returns table (categoria_id uuid, gasto numeric, porcentaje numeric, supera_umbral boolean)
language sql stable security invoker set search_path = public as $$
  with
    g as (select gc.categoria_id, gc.gasto from gasto_por_categoria(p_desde, p_hasta) gc),
    base as (select sum(g.gasto) as total from g where g.gasto > 0)
  select c.id, g.gasto, g.gasto * 100 / base.total, g.gasto * 100 / base.total > 20
  from categorias c
  join g on g.categoria_id = c.id
  cross join base
  where c.user_id = auth.uid() and c.clave = 'otros_gastos' and g.gasto > 0 and base.total > 0
$$;


-- ---------------------------------------------------------------- Permisos de funciones
revoke execute on function
  progreso_objetivos(date),
  ritmo_gasto(date, date, date, date),
  peso_otros_gastos(date, date)
from public, anon, authenticated;

grant execute on function
  progreso_objetivos(date),
  ritmo_gasto(date, date, date, date),
  peso_otros_gastos(date, date)
to authenticated;
