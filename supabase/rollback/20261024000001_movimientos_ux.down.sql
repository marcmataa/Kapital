-- Rollback de 20261024000001_movimientos_ux.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
-- Borra las funciones nuevas (no hay tablas ni datos propios: los ajustes
-- creados con crear_ajuste son movimientos normales y se conservan) y deja
-- crear_banco como en 20261019000000_onboarding_y_analisis.sql. Las cuentas
-- creadas con una fecha de partida anterior conservan esa fecha.

drop function if exists crear_banco(text, text, text, text, date);
drop function if exists media_gasto_categoria(uuid, integer);
drop function if exists crear_ajuste(uuid, text, text, text, date);
drop function if exists calcular_ajuste(uuid, text, date);
drop function if exists gastos_devolvibles(uuid, integer);
drop function if exists categorias_mas_usadas(tipo_categoria);
drop function if exists sugerir_categoria(text, tipo_categoria);
drop function if exists normalizar_concepto(text);
drop function if exists resumen_filtro(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid);
drop function if exists subtotales_por_dia(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid);
drop function if exists totales_por_tipo(text, date, date, uuid, metodo_pago, uuid);
drop function if exists movimientos_filtrados(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid);

-- crear_banco original: siempre con fecha de hoy.
create function crear_banco(p_entidad text, p_nombre text, p_color text, p_saldo text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_entidad  text := nullif(btrim(coalesce(p_entidad, '')), '');
  v_nombre   text;
  v_saldo    numeric;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;
  if v_entidad is not null and nombre_entidad(v_entidad) is null then
    raise exception 'Banco no reconocido: %', v_entidad using errcode = '22023';
  end if;
  v_nombre := coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), nombre_entidad(v_entidad));
  if v_nombre is null then
    raise exception 'Escribe el nombre del banco' using errcode = '22023';
  end if;
  v_saldo := leer_saldo(p_saldo);

  begin
    insert into cuentas (user_id, nombre, tipo, entidad, color, saldo_inicial, fecha_inicial, es_principal, orden)
    values (
      v_uid, v_nombre, 'banco', v_entidad, nullif(btrim(coalesce(p_color, '')), ''), v_saldo, hoy_usuario(),
      not exists (select 1 from cuentas c where c.user_id = v_uid and c.es_principal),
      coalesce((select max(c.orden) from cuentas c where c.user_id = v_uid), 0) + 1)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya tienes una cuenta llamada «%»', v_nombre using errcode = '23505';
  end;
  return v_id;
end $$;

revoke execute on function crear_banco(text, text, text, text) from public, anon, authenticated;
grant execute on function crear_banco(text, text, text, text) to authenticated;
