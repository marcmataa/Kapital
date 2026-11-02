-- =====================================================================
--  Kapital · Devoluciones pendientes de revisión
--
--  Reglas:   docs/reglas-financieras.md, sección 3 («Devoluciones antiguas
--            sin vincular» y «Devoluciones antiguas que incumplen las reglas»).
--  Rollback: supabase/rollback/20261102000002_devoluciones_revision.down.sql
--  Tests:    tests/db/devoluciones-revision.test.ts (+ seguridad)
--
--  Solo lectura: lista las devoluciones que hay que revisar a mano. Nunca
--  vincula, cambia ni borra nada; el usuario las corrige editándolas, y al
--  guardarlas validar_devolucion (20261102000001) exige el vínculo, la fecha
--  y pone la categoría del gasto.
--
--  Motivo de cada fila (una sola, por este orden):
--    sin_vincular    devolución antigua sin gasto original
--    fecha_anterior  vinculada, pero con fecha anterior a su compra
--    otra_categoria  vinculada, pero con una categoría distinta de la de su gasto
-- =====================================================================

create function devoluciones_pendientes_revision()
returns table (
  id            uuid,
  fecha         date,
  concepto      text,
  importe       numeric,
  categoria_id  uuid,
  cuenta_id     uuid,
  motivo        text,
  gasto_id      uuid,
  gasto_fecha   date,
  gasto_concepto text
)
language sql stable security invoker set search_path = public as $$
  select d.id, d.fecha, d.concepto, d.importe, d.categoria_id, d.cuenta_id,
         case
           when d.devolucion_de is null then 'sin_vincular'
           when d.fecha < g.fecha then 'fecha_anterior'
           else 'otra_categoria'
         end,
         g.id, g.fecha, g.concepto
  from movimientos d
  left join movimientos g on g.id = d.devolucion_de and g.user_id = d.user_id
  where d.user_id = (select auth.uid())
    and d.tipo = 'devolucion'
    and (d.devolucion_de is null
         or d.fecha < g.fecha
         or d.categoria_id is distinct from g.categoria_id)
  order by d.fecha desc, d.id
$$;

revoke execute on function devoluciones_pendientes_revision() from public;
revoke execute on function devoluciones_pendientes_revision() from anon;
grant execute on function devoluciones_pendientes_revision() to authenticated;
