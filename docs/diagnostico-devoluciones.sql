-- =====================================================================
-- Diagnóstico de devoluciones antes de M1 (devoluciones imputadas a su compra)
-- =====================================================================
-- SOLO LECTURA: todas las consultas son SELECT. No crean, cambian ni borran
-- nada. No es una migración: no va en supabase/migrations/.
--
-- Cómo usarlo: en el SQL Editor de Supabase, ejecuta cada bloque por
-- separado (el editor solo muestra el resultado de la última consulta).
-- El editor entra como `postgres` y no aplica RLS, así que cada consulta
-- agrupa o filtra por user_id.
--
-- Regla nueva (docs/reglas-financieras.md §3): una devolución vinculada
-- resta en la categoría y el mes de su compra; una sin vincular, en su
-- propia fecha y categoría. La fecha real (saldo, patrimonio) no cambia.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Recuento por situación
select d.user_id,
       count(*)                                                                         as devoluciones,
       count(*) filter (where d.devolucion_de is null)                                  as sin_vincular,
       count(*) filter (where d.devolucion_de is not null)                              as vinculadas,
       count(*) filter (where g.id is not null and d.fecha < g.fecha)                   as vinculadas_antes_del_gasto,
       count(*) filter (where g.id is not null and d.categoria_id <> g.categoria_id)    as vinculadas_otra_categoria,
       count(*) filter (where g.id is not null
                        and date_trunc('month', d.fecha) <> date_trunc('month', g.fecha)) as vinculadas_otro_mes,
       count(*) filter (where d.devolucion_de is not null and g.id is null)             as vinculo_roto,
       count(*) filter (where g.id is not null and g.tipo <> 'gasto')                   as vinculadas_a_no_gasto
from movimientos d
left join movimientos g on g.id = d.devolucion_de and g.user_id = d.user_id
where d.tipo = 'devolucion'
group by d.user_id;


-- ---------------------------------------------------------------- 2. Pendientes de revisión: sin vincular
-- Las que irán a la lista «Pendientes de revisión». Nunca se vinculan solas.
select d.id, d.fecha, d.importe::text, c.nombre as categoria, cu.nombre as cuenta,
       d.origen::text, d.concepto
from movimientos d
join categorias c  on c.id = d.categoria_id and c.user_id = d.user_id
join cuentas    cu on cu.id = d.cuenta_id   and cu.user_id = d.user_id
where d.tipo = 'devolucion' and d.devolucion_de is null
order by d.fecha, d.id;


-- ---------------------------------------------------------------- 3. Vinculadas con discrepancias
-- Fecha anterior a su compra, o categoría distinta de la de su gasto.
-- Se marcarán para revisión sin cambiar su fecha ni su categoría.
select d.id                                     as devolucion,
       d.fecha                                  as fecha_devolucion,
       g.id                                     as gasto,
       g.fecha                                  as fecha_gasto,
       d.importe::text                          as importe_devolucion,
       g.importe::text                          as importe_gasto,
       cd.nombre                                as categoria_devolucion,
       cg.nombre                                as categoria_gasto,
       (d.fecha < g.fecha)                      as fecha_anterior_al_gasto,
       (d.categoria_id <> g.categoria_id)       as otra_categoria,
       (date_trunc('month', d.fecha) <> date_trunc('month', g.fecha)) as otro_mes
from movimientos d
join movimientos g  on g.id = d.devolucion_de and g.user_id = d.user_id
join categorias  cd on cd.id = d.categoria_id and cd.user_id = d.user_id
join categorias  cg on cg.id = g.categoria_id and cg.user_id = g.user_id
where d.tipo = 'devolucion'
  and (d.fecha < g.fecha
       or d.categoria_id <> g.categoria_id
       or date_trunc('month', d.fecha) <> date_trunc('month', g.fecha))
order by g.fecha, d.fecha;


-- ---------------------------------------------------------------- 4. Comprobación de límites
-- Gastos cuyo total devuelto supera su importe. Debería salir vacía: el
-- trigger ya lo impide, pero se comprueba por si hubo carreras o cargas
-- con los triggers desactivados.
select g.id as gasto, g.fecha, g.importe::text as importe_gasto,
       sum(d.importe)::text as devuelto, count(*) as n_devoluciones
from movimientos g
join movimientos d on d.devolucion_de = g.id and d.user_id = g.user_id
where g.tipo = 'gasto'
group by g.id, g.fecha, g.importe
having sum(d.importe) > g.importe
order by g.fecha;


-- ---------------------------------------------------------------- 5. Gasto neto por mes: hoy frente a la regla nueva
-- hoy   = cada devolución resta en su fecha y su categoría.
-- nuevo = vinculada → fecha y categoría de su gasto; sin vincular → las suyas.
with base as (
  select m.user_id, m.tipo, m.importe,
         m.fecha                                                                  as fecha_hoy,
         case when m.tipo = 'devolucion' and g.id is not null then g.fecha else m.fecha end as fecha_nueva
  from movimientos m
  left join movimientos g on g.id = m.devolucion_de and g.user_id = m.user_id and g.tipo = 'gasto'
  where m.tipo in ('gasto', 'devolucion')
),
filas as (
  select user_id, date_trunc('month', fecha_hoy)::date as mes,
         case when tipo = 'gasto' then importe else -importe end as hoy, 0::numeric as nuevo
  from base
  union all
  select user_id, date_trunc('month', fecha_nueva)::date,
         0, case when tipo = 'gasto' then importe else -importe end
  from base
)
select user_id, mes,
       sum(hoy)::text              as gasto_neto_hoy,
       sum(nuevo)::text            as gasto_neto_nuevo,
       (sum(nuevo) - sum(hoy))::text as diferencia
from filas
group by user_id, mes
order by user_id, mes;


-- ---------------------------------------------------------------- 6. Gasto neto por mes y categoría: solo lo que cambia
with base as (
  select m.user_id, m.tipo, m.importe,
         m.fecha as fecha_hoy, m.categoria_id as cat_hoy,
         case when m.tipo = 'devolucion' and g.id is not null then g.fecha        else m.fecha        end as fecha_nueva,
         case when m.tipo = 'devolucion' and g.id is not null then g.categoria_id else m.categoria_id end as cat_nueva
  from movimientos m
  left join movimientos g on g.id = m.devolucion_de and g.user_id = m.user_id and g.tipo = 'gasto'
  where m.tipo in ('gasto', 'devolucion')
),
filas as (
  select user_id, date_trunc('month', fecha_hoy)::date as mes, cat_hoy as categoria_id,
         case when tipo = 'gasto' then importe else -importe end as hoy, 0::numeric as nuevo
  from base
  union all
  select user_id, date_trunc('month', fecha_nueva)::date, cat_nueva,
         0, case when tipo = 'gasto' then importe else -importe end
  from base
)
select f.user_id, f.mes, c.nombre as categoria,
       sum(f.hoy)::text                  as gasto_hoy,
       sum(f.nuevo)::text                as gasto_nuevo,
       (sum(f.nuevo) - sum(f.hoy))::text as diferencia,
       (sum(f.hoy) < 0)                  as negativa_hoy,
       (sum(f.nuevo) < 0)                as negativa_nueva
from filas f
join categorias c on c.id = f.categoria_id and c.user_id = f.user_id
group by f.user_id, f.mes, c.nombre
having sum(f.nuevo) <> sum(f.hoy) or sum(f.hoy) < 0 or sum(f.nuevo) < 0
order by f.user_id, f.mes, c.nombre;


-- ---------------------------------------------------------------- 7. Devoluciones desplazadas por mes (sección 5)
-- Lo que tendrá la pieza nueva de la variación patrimonial: + lo cobrado
-- este mes de compras de otros meses, − lo cobrado en otros meses de
-- compras de este mes. Por cada devolución, las dos filas suman 0.
with vinculadas as (
  select d.user_id, d.importe,
         date_trunc('month', d.fecha)::date as mes_real,
         date_trunc('month', g.fecha)::date as mes_compra
  from movimientos d
  join movimientos g on g.id = d.devolucion_de and g.user_id = d.user_id and g.tipo = 'gasto'
  where d.tipo = 'devolucion'
    and date_trunc('month', d.fecha) <> date_trunc('month', g.fecha)
)
select user_id, mes, sum(importe)::text as devoluciones_desplazadas
from (
  select user_id, mes_real   as mes,  importe from vinculadas
  union all
  select user_id, mes_compra as mes, -importe from vinculadas
) x
group by user_id, mes
order by user_id, mes;
