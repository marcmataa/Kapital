-- =====================================================================
-- Diagnóstico antes de eliminar 4 categorías de gasto
-- (Cuidado personal, Regalos, Hogar, Salud → sus movimientos pasan a Otros gastos)
-- =====================================================================
-- SOLO LECTURA: todas las consultas son SELECT. No crean, cambian ni borran
-- nada. No es una migración: no va en supabase/migrations/.
--
-- Cómo usarlo: en el SQL Editor de Supabase, ejecuta cada bloque por
-- separado (el editor solo muestra el resultado de la última consulta).
-- El editor entra como `postgres` y no aplica RLS, así que cada consulta
-- agrupa o filtra por user_id.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Movimientos afectados por categoría
select c.user_id, c.nombre as categoria, c.clave, c.archivada,
       count(m.id)                                          as movimientos,
       count(m.id) filter (where m.tipo = 'gasto')          as gastos,
       count(m.id) filter (where m.tipo = 'devolucion')     as devoluciones,
       count(m.id) filter (where m.tipo not in ('gasto', 'devolucion')) as otros_tipos,
       coalesce(sum(m.importe) filter (where m.tipo = 'gasto'), 0)::text      as importe_gastos,
       coalesce(sum(m.importe) filter (where m.tipo = 'devolucion'), 0)::text as importe_devoluciones
from categorias c
left join movimientos m on m.categoria_id = c.id and m.user_id = c.user_id
where c.clave in ('cuidado_personal', 'regalos', 'hogar', 'salud')
group by c.user_id, c.nombre, c.clave, c.archivada
order by c.user_id, c.nombre;


-- ---------------------------------------------------------------- 2. Objetivos que usan esas categorías
-- Ojo: objetivos.categoria_id tiene «on delete cascade». Si sale alguno,
-- NO se borra la categoría hasta decidir qué hacer con él.
select o.user_id, o.id, o.tipo::text, c.nombre as categoria, o.importe::text, o.activo, o.created_at
from objetivos o
join categorias c on c.id = o.categoria_id and c.user_id = o.user_id
where c.clave in ('cuidado_personal', 'regalos', 'hogar', 'salud')
order by o.user_id, c.nombre;


-- ---------------------------------------------------------------- 3. ¿Existe «Otros gastos» para cada usuario afectado?
select c.user_id,
       bool_or(c.clave = 'otros_gastos' and not c.archivada) as tiene_otros_gastos
from categorias c
where c.user_id in (select user_id from categorias where clave in ('cuidado_personal', 'regalos', 'hogar', 'salud'))
group by c.user_id;


-- ---------------------------------------------------------------- 4. Gasto neto mensual de referencia (para comparar después)
-- Guarda este resultado: tras la migración debe salir idéntico.
select m.user_id, date_trunc('month', m.fecha)::date as mes,
       coalesce(sum(m.importe) filter (where m.tipo = 'gasto'), 0)::text      as gastos,
       coalesce(sum(m.importe) filter (where m.tipo = 'devolucion'), 0)::text as devoluciones
from movimientos m
group by m.user_id, date_trunc('month', m.fecha)
order by m.user_id, mes;


-- ---------------------------------------------------------------- 5. Devoluciones sin gasto vinculado (punto 7)
select d.user_id, count(*) as sin_vincular, sum(d.importe)::text as importe
from movimientos d
where d.tipo = 'devolucion' and d.devolucion_de is null
group by d.user_id;
