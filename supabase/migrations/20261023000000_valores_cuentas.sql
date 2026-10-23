-- Valor de cada cuenta al cierre de un día D (secciones 4 y 6), para el desglose del
-- patrimonio por cuenta en Inicio cuando se mira un mes cerrado.
--
-- valor_cuenta() es escalar: PostgREST lo devolvería como número JSON (coma flotante) y
-- no se puede pedir con ::text. Esta función devuelve una tabla, así que el cliente pide
-- `valor::text` y el importe viaja exacto.
--
-- Solo las cuentas que existían en D y no estaban cerradas ese día (una cuenta cerrada
-- vale 0). La suma de `valor` es patrimonio(D).
-- security invoker: RLS sigue filtrando las cuentas por usuario.
create function valores_cuentas(p_fecha date)
returns table (cuenta_id uuid, valor numeric)
language sql stable security invoker set search_path = public as $$
  select c.id, valor_cuenta(c.id, p_fecha)
  from cuentas c
  where c.user_id = auth.uid()
    and c.fecha_inicial <= p_fecha
    and (c.fecha_cierre is null or c.fecha_cierre > p_fecha)
$$;

revoke execute on function valores_cuentas(date) from public, anon, authenticated;
grant execute on function valores_cuentas(date) to authenticated;
