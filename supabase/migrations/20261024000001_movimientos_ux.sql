-- =====================================================================
--  Kapital · Movimientos: totales de la lista, sugerencias y ajuste por saldo real
--
--  Reglas:   docs/reglas-financieras.md (secciones 2, 3, 8 y 9).
--  Rollback: supabase/rollback/20261024000001_movimientos_ux.down.sql
--  Tests:    tests/db/movimientos-ux.test.ts (+ seguridad, onboarding)
--
--  Lista de movimientos (todo con los mismos filtros que la lista):
--   1. movimientos_filtrados: los movimientos que cumplen los filtros de la lista.
--   2. totales_por_tipo: número y total de cada tipo (chips «Gastos · 38 · −863 €»).
--   3. subtotales_por_dia: balance de cada día (cabeceras «21 oct · −51,57 €»).
--      Traspasos y ajustes no cuentan en el balance (sección 3).
--   4. resumen_filtro: resumen del filtro activo (nº, balance, gasto medio diario,
--      categoría principal) para el panel de escritorio.
--  Formulario:
--   5. normalizar_concepto + sugerir_categoria: la categoría más usada para un
--      concepto según el historial.
--   6. categorias_mas_usadas: categorías ordenadas por uso reciente.
--   7. gastos_devolvibles: gastos con lo que queda por devolver (regla 3 de
--      validar_movimiento), para elegir el «Gasto original» de una devolución.
--   8. calcular_ajuste / crear_ajuste: ajuste por saldo real (sección 9: «Ajuste
--      por la diferencia, con nota»). La diferencia la calcula la base.
--  Configuración:
--   9. media_gasto_categoria: gasto neto medio mensual de una categoría con
--      meses completos (sección 8: el mes en curso no entra).
--  10. crear_banco admite una fecha de partida anterior a hoy.
--
--  Todas son security invoker (RLS + auth.uid()). Supabase concede EXECUTE a
--  PUBLIC y anon sobre toda función nueva: se revoca y se concede solo a
--  authenticated.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Filtros de la lista
-- Mismos filtros que la consulta de la lista en la web (features/movimientos):
-- búsqueda en concepto o comercio, tipo, rango de fechas, categoría, método y
-- cuenta (de origen O de destino). NULL = sin ese filtro. La búsqueda es texto
-- literal: los comodines de LIKE se escapan.
create function movimientos_filtrados(
  p_q text default null, p_tipo tipo_movimiento default null, p_desde date default null, p_hasta date default null,
  p_categoria uuid default null, p_metodo metodo_pago default null, p_cuenta uuid default null)
returns setof movimientos
language sql stable security invoker set search_path = public as $$
  with b as (
    select '%' || replace(replace(replace(nullif(btrim(coalesce(p_q, '')), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron
  )
  select m.*
  from movimientos m, b
  where m.user_id = auth.uid()
    and (b.patron is null or m.concepto ilike b.patron or m.comercio ilike b.patron)
    and (p_tipo is null or m.tipo = p_tipo)
    and (p_desde is null or m.fecha >= p_desde)
    and (p_hasta is null or m.fecha <= p_hasta)
    and (p_categoria is null or m.categoria_id = p_categoria)
    and (p_metodo is null or m.metodo = p_metodo)
    and (p_cuenta is null or m.cuenta_id = p_cuenta or m.cuenta_destino_id = p_cuenta)
$$;


-- ---------------------------------------------------------------- 2. Chips: número y total por tipo
-- Sin filtro de tipo (los chips son el filtro de tipo). Total siempre positivo
-- salvo en ajustes, que es neto (suma − resta): el signo del gasto lo pone la UI.
create function totales_por_tipo(
  p_q text default null, p_desde date default null, p_hasta date default null,
  p_categoria uuid default null, p_metodo metodo_pago default null, p_cuenta uuid default null)
returns table (tipo tipo_movimiento, n integer, total numeric)
language sql stable security invoker set search_path = public as $$
  select f.tipo, count(*)::int,
         sum(case when f.tipo = 'ajuste' and f.sentido = 'resta' then -f.importe else f.importe end)
  from movimientos_filtrados(p_q, null, p_desde, p_hasta, p_categoria, p_metodo, p_cuenta) f
  group by f.tipo
  order by f.tipo
$$;


-- ---------------------------------------------------------------- 3. Subtotal de cada día
-- Balance del día (sección 3): ingresos + devoluciones − gastos. Traspasos y
-- ajustes no cuentan: un día solo con ellos tiene balance NULL (no se muestra).
create function subtotales_por_dia(
  p_q text default null, p_tipo tipo_movimiento default null, p_desde date default null, p_hasta date default null,
  p_categoria uuid default null, p_metodo metodo_pago default null, p_cuenta uuid default null)
returns table (fecha date, n integer, balance numeric)
language sql stable security invoker set search_path = public as $$
  select f.fecha, count(*)::int,
         case when count(*) filter (where f.tipo in ('gasto', 'ingreso', 'devolucion')) > 0 then
           coalesce(sum(f.importe) filter (where f.tipo in ('ingreso', 'devolucion')), 0.00)
             - coalesce(sum(f.importe) filter (where f.tipo = 'gasto'), 0.00)
         end
  from movimientos_filtrados(p_q, p_tipo, p_desde, p_hasta, p_categoria, p_metodo, p_cuenta) f
  group by f.fecha
  order by f.fecha desc
$$;


-- ---------------------------------------------------------------- 4. Resumen del filtro activo
-- Para el panel de escritorio sin selección. Balance y gasto neto como en la
-- sección 3 (sin traspasos ni ajustes; los ajustes van aparte). Días: del
-- inicio del filtro (o el primer movimiento) al final del filtro (o hoy, o el
-- último movimiento si es posterior). Categoría principal: la de mayor gasto
-- neto positivo (sección 8). Sin movimientos: n = 0 y el resto NULL.
create function resumen_filtro(
  p_q text default null, p_tipo tipo_movimiento default null, p_desde date default null, p_hasta date default null,
  p_categoria uuid default null, p_metodo metodo_pago default null, p_cuenta uuid default null)
returns table (n integer, ingresos numeric, gastos numeric, devoluciones numeric, gastos_netos numeric,
               balance numeric, ajustes numeric, dias integer, gasto_medio_diario numeric,
               categoria_id uuid, categoria_gasto numeric)
language sql stable security invoker set search_path = public as $$
  with
    f as (select * from movimientos_filtrados(p_q, p_tipo, p_desde, p_hasta, p_categoria, p_metodo, p_cuenta)),
    t as (
      select count(*)::int as n,
             coalesce(sum(f.importe) filter (where f.tipo = 'ingreso'), 0.00) as ingresos,
             coalesce(sum(f.importe) filter (where f.tipo = 'gasto'), 0.00) as gastos,
             coalesce(sum(f.importe) filter (where f.tipo = 'devolucion'), 0.00) as devoluciones,
             coalesce(sum(case f.sentido when 'resta' then -f.importe else f.importe end)
                      filter (where f.tipo = 'ajuste'), 0.00) as ajustes,
             coalesce(p_desde, min(f.fecha)) as desde,
             coalesce(p_hasta, greatest(max(f.fecha), hoy_usuario())) as hasta
      from f
    ),
    cat as (
      select f.categoria_id, sum(case when f.tipo = 'gasto' then f.importe else -f.importe end) as gasto
      from f
      where f.tipo in ('gasto', 'devolucion')
      group by f.categoria_id
      having sum(case when f.tipo = 'gasto' then f.importe else -f.importe end) > 0
      order by 2 desc, f.categoria_id
      limit 1
    )
  select t.n,
         case when t.n > 0 then t.ingresos end,
         case when t.n > 0 then t.gastos end,
         case when t.n > 0 then t.devoluciones end,
         case when t.n > 0 then t.gastos - t.devoluciones end,
         case when t.n > 0 then t.ingresos - (t.gastos - t.devoluciones) end,
         case when t.n > 0 then t.ajustes end,
         case when t.n > 0 and t.hasta >= t.desde then (t.hasta - t.desde + 1) end,
         case when t.n > 0 and t.hasta >= t.desde then (t.gastos - t.devoluciones) / (t.hasta - t.desde + 1) end,
         cat.categoria_id,
         cat.gasto
  from t
  left join cat on true
$$;


-- ---------------------------------------------------------------- 5. Sugerir categoría
-- «Café Bar 23» → «cafe bar»: minúsculas, sin tildes, solo letras y espacios.
-- Las mayúsculas acentuadas se traducen antes de lower() (no depende del locale).
create function normalizar_concepto(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'áàäâãÁÀÄÂÃéèëêÉÈËÊíìïîÍÌÏÎóòöôõÓÒÖÔÕúùüûÚÙÜÛñÑçÇ',
    'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuunncc')), '[^a-z]+', ' ', 'g')), '')
$$;

-- Categoría (activa, del tipo pedido) más usada con ese concepto normalizado.
-- Primero las coincidencias exactas; si no hay, las que empiezan igual (3+
-- letras). Empates: la usada más recientemente. NULL si no hay historial.
create function sugerir_categoria(p_concepto text, p_tipo tipo_categoria default 'gasto') returns uuid
language sql stable security invoker set search_path = public as $$
  with
    n as (select normalizar_concepto(p_concepto) as c),
    h as (
      select m.categoria_id, m.fecha, normalizar_concepto(m.concepto) as nc
      from movimientos m
      join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
      where m.user_id = auth.uid() and c.tipo = p_tipo and not c.archivada
    )
  select h.categoria_id
  from h, n
  where n.c is not null
    and (h.nc = n.c or (length(n.c) >= 3 and h.nc like n.c || '%'))
  group by h.categoria_id
  order by bool_or(h.nc = n.c) desc, count(*) desc, max(h.fecha) desc, h.categoria_id
  limit 1
$$;


-- ---------------------------------------------------------------- 6. Categorías más usadas
-- Categorías activas de un tipo con sus usos en los últimos 180 días (las que
-- no se usan salen con 0). Orden: más usadas, luego el orden del usuario.
create function categorias_mas_usadas(p_tipo tipo_categoria)
returns table (categoria_id uuid, usos integer)
language sql stable security invoker set search_path = public as $$
  select c.id, count(m.id)::int
  from categorias c
  left join movimientos m
    on m.categoria_id = c.id and m.user_id = c.user_id and m.fecha > hoy_usuario() - 180
  where c.user_id = auth.uid() and c.tipo = p_tipo and not c.archivada
  group by c.id, c.orden, c.nombre
  order by count(m.id) desc, c.orden, c.nombre
$$;


-- ---------------------------------------------------------------- 7. Gastos a los que vincular una devolución
-- Los gastos más recientes con algo por devolver: pendiente = importe − Σ
-- devoluciones vinculadas (regla 3 de validar_movimiento). `p_excluir`: la
-- devolución que se está editando, que no cuenta contra sí misma.
create function gastos_devolvibles(p_excluir uuid default null, p_limite integer default 50)
returns table (id uuid, fecha date, concepto text, importe numeric, pendiente numeric,
               categoria_id uuid, cuenta_id uuid)
language sql stable security invoker set search_path = public as $$
  select g.id, g.fecha, g.concepto, g.importe,
         g.importe - coalesce((select sum(d.importe) from movimientos d
                               where d.devolucion_de = g.id and d.user_id = g.user_id
                                 and (p_excluir is null or d.id <> p_excluir)), 0.00),
         g.categoria_id, g.cuenta_id
  from movimientos g
  where g.user_id = auth.uid() and g.tipo = 'gasto'
    and g.importe > coalesce((select sum(d.importe) from movimientos d
                              where d.devolucion_de = g.id and d.user_id = g.user_id
                                and (p_excluir is null or d.id <> p_excluir)), 0.00)
  order by g.fecha desc, g.created_at desc, g.id desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;


-- ---------------------------------------------------------------- 8. Ajuste por saldo real
-- «¿Cuánto tienes ahora en BBVA?». El saldo real se escribe como texto
-- ("1.258,50", "-20,00" en un descubierto) y se lee con leer_saldo. La
-- diferencia es siempre positiva y el sentido dice si el ajuste suma o resta
-- (sección 1: el tipo decide el signo). Diferencia 0 = no hace falta ajuste.
-- Errores (22023, mensaje = código para la web): cuenta_no_valida,
-- cuenta_cerrada, fecha_no_valida, saldo_no_valido.
create function calcular_ajuste(p_cuenta uuid, p_saldo_real text, p_fecha date default null)
returns table (saldo_app numeric, saldo_real numeric, diferencia numeric, sentido sentido_ajuste)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_fecha  date := coalesce(p_fecha, hoy_usuario());
  v_cuenta cuentas;
  v_texto  text := btrim(coalesce(p_saldo_real, ''));
  v_neg    boolean := false;
  v_real   numeric;
  v_app    numeric;
begin
  select * into v_cuenta from cuentas c where c.id = p_cuenta and c.user_id = auth.uid();
  if not found then
    raise exception 'cuenta_no_valida' using errcode = '22023';
  end if;
  if v_cuenta.fecha_cierre is not null then
    raise exception 'cuenta_cerrada' using errcode = '22023';
  end if;
  if v_fecha < v_cuenta.fecha_inicial or v_fecha > hoy_usuario() then
    raise exception 'fecha_no_valida' using errcode = '22023';
  end if;

  if left(v_texto, 1) = '-' then
    v_neg := true;
    v_texto := btrim(substr(v_texto, 2));
  end if;
  begin
    v_real := leer_saldo(v_texto);
  exception when invalid_parameter_value then
    raise exception 'saldo_no_valido' using errcode = '22023';
  end;
  if v_neg then v_real := -v_real; end if;
  if abs(v_real) > 9999999999.99 then
    raise exception 'saldo_no_valido' using errcode = '22023';
  end if;

  v_app := valor_cuenta(p_cuenta, v_fecha);
  return query select v_app, v_real, abs(v_real - v_app),
    (case when v_real > v_app then 'suma' when v_real < v_app then 'resta' end)::sentido_ajuste;
end $$;

-- Crea el ajuste con la diferencia que calcula calcular_ajuste (nunca la que
-- mande el cliente). La nota es obligatoria (sección 9). Si la diferencia es
-- 0 no crea nada y devuelve id NULL. Un cerrojo por cuenta evita que dos
-- ajustes simultáneos corrijan dos veces el mismo descuadre.
create function crear_ajuste(p_cuenta uuid, p_saldo_real text, p_nota text, p_concepto text default null,
                             p_fecha date default null)
returns table (id uuid, diferencia numeric, sentido sentido_ajuste)
language plpgsql security invoker set search_path = public as $$
declare
  v_fecha date := coalesce(p_fecha, hoy_usuario());
  v_nota  text := nullif(btrim(coalesce(p_nota, '')), '');
  v_calc  record;
  v_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;
  if v_nota is null or length(v_nota) > 1000 then
    raise exception 'nota_obligatoria' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kapital:ajuste:' || p_cuenta::text, 0));

  select * into v_calc from calcular_ajuste(p_cuenta, p_saldo_real, v_fecha);
  if v_calc.diferencia = 0 then
    return query select null::uuid, 0.00::numeric, null::sentido_ajuste;
    return;
  end if;

  insert into movimientos (fecha, concepto, tipo, importe, sentido, cuenta_id, notas, origen)
  values (v_fecha, coalesce(left(nullif(btrim(coalesce(p_concepto, '')), ''), 200), 'Ajuste de saldo'),
          'ajuste', v_calc.diferencia, v_calc.sentido, p_cuenta, v_nota, 'app')
  returning movimientos.id into v_id;

  return query select v_id, v_calc.diferencia, v_calc.sentido;
end $$;


-- ---------------------------------------------------------------- 9. Media mensual de una categoría
-- Gasto neto medio (gastos − devoluciones, sección 8) de una categoría en los
-- últimos `p_meses` meses COMPLETOS: el mes en curso no entra, ni los meses
-- anteriores al inicio de los datos (fecha de partida más antigua de las
-- cuentas; si empieza a mitad de mes, ese mes no está completo). Sin meses
-- completos: media NULL y meses 0.
create function media_gasto_categoria(p_categoria uuid, p_meses integer default 3)
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


-- ---------------------------------------------------------------- 10. Banco con fecha de partida
-- Igual que crear_banco (20261019000000_onboarding_y_analisis.sql) con una fecha
-- de partida opcional: NULL = hoy. No puede ser futura. El saldo es el que
-- había ese día (los movimientos anteriores ya están en él).
drop function crear_banco(text, text, text, text);

create function crear_banco(p_entidad text, p_nombre text, p_color text, p_saldo text, p_fecha_inicial date default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_entidad  text := nullif(btrim(coalesce(p_entidad, '')), '');
  v_nombre   text;
  v_saldo    numeric;
  v_fecha    date;
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
  v_fecha := coalesce(p_fecha_inicial, hoy_usuario());
  if v_fecha > hoy_usuario() then
    raise exception 'fecha_futura' using errcode = '22007';
  end if;

  begin
    insert into cuentas (user_id, nombre, tipo, entidad, color, saldo_inicial, fecha_inicial, es_principal, orden)
    values (
      v_uid, v_nombre, 'banco', v_entidad, nullif(btrim(coalesce(p_color, '')), ''), v_saldo, v_fecha,
      not exists (select 1 from cuentas c where c.user_id = v_uid and c.es_principal),
      coalesce((select max(c.orden) from cuentas c where c.user_id = v_uid), 0) + 1)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya tienes una cuenta llamada «%»', v_nombre using errcode = '23505';
  end;
  return v_id;
end $$;


-- ---------------------------------------------------------------- Permisos de funciones
revoke execute on function
  movimientos_filtrados(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid),
  totales_por_tipo(text, date, date, uuid, metodo_pago, uuid),
  subtotales_por_dia(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid),
  resumen_filtro(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid),
  normalizar_concepto(text),
  sugerir_categoria(text, tipo_categoria),
  categorias_mas_usadas(tipo_categoria),
  gastos_devolvibles(uuid, integer),
  calcular_ajuste(uuid, text, date),
  crear_ajuste(uuid, text, text, text, date),
  media_gasto_categoria(uuid, integer),
  crear_banco(text, text, text, text, date)
from public, anon, authenticated;

grant execute on function
  movimientos_filtrados(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid),
  totales_por_tipo(text, date, date, uuid, metodo_pago, uuid),
  subtotales_por_dia(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid),
  resumen_filtro(text, tipo_movimiento, date, date, uuid, metodo_pago, uuid),
  normalizar_concepto(text),
  sugerir_categoria(text, tipo_categoria),
  categorias_mas_usadas(tipo_categoria),
  gastos_devolvibles(uuid, integer),
  calcular_ajuste(uuid, text, date),
  crear_ajuste(uuid, text, text, text, date),
  media_gasto_categoria(uuid, integer),
  crear_banco(text, text, text, text, date)
to authenticated;
