-- =====================================================================
--  Kapital · Devoluciones que cubren varios gastos y sobrante como ingreso
--
--  Reglas:   docs/reglas-financieras.md, sección 3 («Devoluciones», cambio del
--            02/11/2026), 10 y 11.
--  Rollback: supabase/rollback/20261103000001_devoluciones_varios_gastos.down.sql
--  Tests:    tests/db/devoluciones-varios-gastos.test.ts (+ seguridad)
--
--  Alcance: registro de devoluciones y sugerencias. Las funciones de cálculo
--  (balance, categorías…) NO cambian aquí.
--
--   1. grupo_devolucion: agrupa las filas que se guardaron juntas (una
--      devolución por gasto y, si sobra dinero, el ingreso del sobrante).
--      Solo en devoluciones e ingresos; si una fila cambia a otro tipo, sale
--      del grupo.
--   2. registrar_devoluciones: guarda de forma atómica una devolución por gasto
--      (cada una vinculada a su gasto, con su importe y la categoría de su
--      gasto) y, si lo recibido supera lo pendiente, UN ingreso por el sobrante
--      (Otros ingresos por defecto). validar_devolucion no cambia: ninguna
--      devolución supera lo pendiente de su gasto.
--   3. buscar_gastos_devolvibles: manda el parecido del NOMBRE. Más palabras en
--      común con el concepto de la devolución = más arriba; el importe y la
--      fecha solo desempatan. Mismas columnas; motivo nuevo «palabras_en_comun».
-- =====================================================================


-- ---------------------------------------------------------------- 1. Grupo de devolución
alter table movimientos add column grupo_devolucion uuid;
alter table movimientos add constraint grupo_devolucion_solo_devolucion_ingreso
  check (grupo_devolucion is null or tipo in ('devolucion', 'ingreso'));

create index movimientos_grupo_devolucion_idx on movimientos (user_id, grupo_devolucion)
  where grupo_devolucion is not null;

-- Una fila del grupo que se edita y pasa a otro tipo (p. ej. el ingreso del
-- sobrante que en realidad era un gasto) deja el grupo en vez de fallar.
create function salir_de_grupo_devolucion() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.grupo_devolucion is not null and new.tipo not in ('devolucion', 'ingreso') then
    new.grupo_devolucion := null;
  end if;
  return new;
end $$;

create trigger movimientos_grupo_devolucion before update on movimientos
  for each row when (new.grupo_devolucion is not null)
  execute function salir_de_grupo_devolucion();


-- ---------------------------------------------------------------- 2. Registrar varias devoluciones a la vez
-- Parámetros:
--   p_fecha, p_cuenta, p_concepto, p_metodo, p_notas: comunes a todas las filas.
--   p_repartos  [{"gasto": uuid, "importe": "14.00"}, …] en el orden elegido.
--               Importes como texto, leídos con leer_importe (nunca float).
--   p_sobrante  lo que supera lo pendiente de los gastos (texto) o null.
--   p_categoria_sobrante  categoría de ingreso del sobrante; null = Otros ingresos.
-- Reglas:
--   - al menos un gasto, sin repetir, cada uno del usuario y de tipo gasto;
--   - cada importe > 0 y ≤ lo pendiente de su gasto (validar_devolucion);
--   - hay sobrante solo si cada gasto se devuelve entero (todo lo pendiente):
--     si no, el sobrante tendría que ir a ese gasto y no cuadra;
--   - si se crea más de una fila, todas comparten un grupo_devolucion nuevo.
-- Todo o nada: cualquier error deshace las filas ya insertadas.
-- Devuelve las filas creadas (en orden; el ingreso del sobrante, la última).
create function registrar_devoluciones(
  p_fecha              date,
  p_cuenta             uuid,
  p_concepto           text,
  p_metodo             text,
  p_notas              text,
  p_repartos           jsonb,
  p_sobrante           text default null,
  p_categoria_sobrante uuid default null
) returns table (id uuid, tipo tipo_movimiento, importe numeric, devolucion_de uuid, categoria_id uuid,
                 grupo_devolucion uuid)
language plpgsql volatile security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_user      uuid := auth.uid();
  v_concepto  text := nullif(btrim(coalesce(p_concepto, '')), '');
  v_notas     text := nullif(btrim(coalesce(p_notas, '')), '');
  v_metodo    metodo_pago;
  v_n         integer;
  v_sobrante  numeric;
  v_cat_sobra uuid;
  v_grupo     uuid;
  v_vistos    uuid[] := '{}';
  v_gasto_id  uuid;
  v_importe   numeric;
  v_gasto     record;
  v_pendiente numeric;
  v_id        uuid;
  r           record;
begin
  if v_user is null then
    raise exception 'Inicia sesión para registrar devoluciones' using errcode = '42501';
  end if;

  if p_repartos is null or jsonb_typeof(p_repartos) <> 'array' or jsonb_array_length(p_repartos) = 0 then
    raise exception 'Elige al menos un gasto que te devuelven' using errcode = '23514';
  end if;
  v_n := jsonb_array_length(p_repartos);
  if v_n > 50 then
    raise exception 'Una devolución puede repartirse entre 50 gastos como mucho' using errcode = '23514';
  end if;

  if v_concepto is null then
    raise exception 'La devolución necesita un concepto' using errcode = '23514';
  end if;
  if p_cuenta is null then
    raise exception 'Elige la cuenta en la que entra la devolución' using errcode = '23514';
  end if;

  if nullif(btrim(coalesce(p_metodo, '')), '') is not null then
    if btrim(p_metodo) not in (select unnest(enum_range(null::metodo_pago))::text) then
      raise exception 'Método no reconocido' using errcode = '23514';
    end if;
    v_metodo := btrim(p_metodo)::metodo_pago;
  end if;

  -- Sobrante: importe > 0 y categoría de ingreso del usuario (Otros ingresos por defecto).
  if nullif(btrim(coalesce(p_sobrante, '')), '') is not null then
    v_sobrante := leer_importe(p_sobrante);
    if v_sobrante is null or v_sobrante <= 0 then
      raise exception 'El importe del sobrante no es válido' using errcode = '23514';
    end if;
    if p_categoria_sobrante is not null then
      select c.id into v_cat_sobra from categorias c
      where c.id = p_categoria_sobrante and c.user_id = v_user and c.tipo = 'ingreso' and not c.archivada;
      if v_cat_sobra is null then
        raise exception 'El sobrante necesita una categoría de ingreso tuya' using errcode = '23514';
      end if;
    else
      select c.id into v_cat_sobra from categorias c
      where c.user_id = v_user and c.clave = 'otros_ingresos' and c.tipo = 'ingreso' and not c.archivada
      order by c.orden, c.created_at limit 1;
      if v_cat_sobra is null then
        raise exception 'No tienes la categoría Otros ingresos: elige la categoría del sobrante' using errcode = '23514';
      end if;
    end if;
  end if;

  if v_n + (case when v_sobrante is null then 0 else 1 end) > 1 then
    v_grupo := gen_random_uuid();
  end if;

  for r in
    select e.val, e.ord from jsonb_array_elements(p_repartos) with ordinality as e(val, ord) order by e.ord
  loop
    if jsonb_typeof(r.val) <> 'object'
       or coalesce(r.val ->> 'gasto', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Solo se puede devolver un gasto tuyo que exista' using errcode = '23514';
    end if;
    v_gasto_id := (r.val ->> 'gasto')::uuid;
    if v_gasto_id = any(v_vistos) then
      raise exception 'El mismo gasto está repetido en el reparto' using errcode = '23514';
    end if;
    v_vistos := v_vistos || v_gasto_id;

    v_importe := leer_importe(r.val ->> 'importe');
    if v_importe is null or v_importe <= 0 then
      raise exception 'El importe de cada gasto del reparto debe ser mayor que 0' using errcode = '23514';
    end if;

    select m.id, m.tipo, m.importe, m.categoria_id into v_gasto
    from movimientos m where m.id = v_gasto_id and m.user_id = v_user;
    if not found then
      raise exception 'Solo se puede devolver un gasto tuyo que exista' using errcode = '23514';
    end if;
    if v_gasto.tipo <> 'gasto' then
      raise exception 'Solo se puede devolver un gasto' using errcode = '23514';
    end if;

    -- Con sobrante, cada gasto se devuelve entero: si no, no cuadra.
    if v_sobrante is not null then
      select v_gasto.importe - coalesce(sum(d.importe), 0) into v_pendiente
      from movimientos d where d.devolucion_de = v_gasto_id and d.user_id = v_user;
      if v_importe <> v_pendiente then
        raise exception 'El reparto no cuadra: solo puede sobrar dinero si cada gasto se devuelve entero'
          using errcode = '23514';
      end if;
    end if;

    -- validar_devolucion bloquea el gasto, pone su categoría y comprueba el límite y la fecha.
    insert into movimientos (fecha, concepto, tipo, importe, categoria_id, metodo, cuenta_id, devolucion_de,
                             notas, origen, grupo_devolucion)
    values (coalesce(p_fecha, hoy_usuario()), v_concepto, 'devolucion', v_importe, v_gasto.categoria_id, v_metodo,
            p_cuenta, v_gasto_id, v_notas, 'app', v_grupo)
    returning movimientos.id into v_id;

    return query select m.id, m.tipo, m.importe, m.devolucion_de, m.categoria_id, m.grupo_devolucion
                 from movimientos m where m.id = v_id;
  end loop;

  if v_sobrante is not null then
    insert into movimientos (fecha, concepto, tipo, importe, categoria_id, metodo, cuenta_id, notas, origen,
                             grupo_devolucion)
    values (coalesce(p_fecha, hoy_usuario()), v_concepto, 'ingreso', v_sobrante, v_cat_sobra, v_metodo, p_cuenta,
            v_notas, 'app', v_grupo)
    returning movimientos.id into v_id;

    return query select m.id, m.tipo, m.importe, m.devolucion_de, m.categoria_id, m.grupo_devolucion
                 from movimientos m where m.id = v_id;
  end if;
end $$;


-- ---------------------------------------------------------------- 3. Sugerencias: manda el parecido del nombre
-- Igual que en 20261102000001_devoluciones_vinculadas.sql salvo el orden y el
-- motivo. Palabras del concepto de la devolución: 3+ letras, sin tildes ni
-- mayúsculas y sin palabras vacías («de», «la», «devolución», «bizum»,
-- «reembolso»…). Una palabra coincide con otra del concepto o del comercio del
-- gasto si es igual o una empieza por la otra («razz» ↔ «razzmatazz»).
-- Orden: nº de palabras en común (desc); a igualdad, importe y fecha
-- (35 × importe + 15 × fecha); después, el más reciente. Un gasto sin palabras
-- en común nunca pasa por delante de uno que sí las tiene, aunque el importe
-- coincida. Sin concepto, el orden es el de importe y fecha.
-- La puntuación (0..100) no cambia: 50 × texto + 35 × importe + 15 × fecha.
-- Motivo: importe_exacto, concepto_parecido (mitad o más de las palabras),
-- palabras_en_comun (alguna), importe_parecido, fecha_cercana o reciente.
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
  v_vacias    text[] := array[
    'devolucion', 'devoluciones', 'devuelto', 'devuelta', 'devolver', 'devolucio', 'reembolso', 'reembolsos',
    'reemborsament', 'refund', 'abono', 'bizum', 'transferencia', 'pago', 'compra', 'parte', 'del', 'las', 'los',
    'por', 'para', 'con', 'una', 'uno', 'unos', 'unas', 'que', 'les', 'dels', 'amb', 'the', 'and', 'for'];
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
      where length(w) >= 3 and w <> all (v_vacias)
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
    comunes as (
      select c.*,
             case
               when q.c is null or nq.n = 0 then 0::numeric
               when c.nc = q.c or c.ncom = q.c then nq.n
               else (select count(*) from palabras p
                     where exists (select 1 from regexp_split_to_table(c.nc || ' ' || c.ncom, ' ') as gw
                                   where length(gw) >= 3 and gw <> all (v_vacias)
                                     and (gw = p.w or gw like p.w || '%' or p.w like gw || '%')))::numeric
             end as n_comun,
             nq.n as n_total
      from candidatos c, q, nq
    ),
    puntos as (
      select c.*,
             case when c.n_total = 0 then 0::numeric else c.n_comun / c.n_total end as s_texto,
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
      from comunes c
    )
  select p.id, p.fecha, p.concepto, p.comercio, p.importe, p.pendiente, p.categoria_id, p.cuenta_id,
         round(50 * p.s_texto + 35 * p.s_importe + 15 * p.s_fecha)::int,
         case
           when p.exacto then 'importe_exacto'
           when p.s_texto >= 0.5 then 'concepto_parecido'
           when p.n_comun > 0 then 'palabras_en_comun'
           when p.s_importe >= 0.5 then 'importe_parecido'
           when p_fecha is not null and p.fecha >= p_fecha - 7 then 'fecha_cercana'
           else 'reciente'
         end
  from puntos p
  order by p.n_comun desc, (35 * p.s_importe + 15 * p.s_fecha) desc, p.fecha desc, p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limite, 20), 1), 100);
end $$;


-- ---------------------------------------------------------------- Permisos de funciones
-- Supabase concede EXECUTE a PUBLIC y anon sobre toda función nueva.
-- registrar_devoluciones es security invoker (RLS + auth.uid()) y solo la usa
-- la app con sesión. buscar_gastos_devolvibles conserva sus permisos
-- (create or replace).
revoke execute on function
  salir_de_grupo_devolucion(),
  registrar_devoluciones(date, uuid, text, text, text, jsonb, text, uuid)
from public, anon, authenticated;

grant execute on function
  registrar_devoluciones(date, uuid, text, text, text, jsonb, text, uuid)
to authenticated;
