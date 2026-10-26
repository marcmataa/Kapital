-- =====================================================================
--  Kapital · Análisis mensual (variación desde la fecha de partida, insights
--  y cascada) y atajo con nombres de categoría traducidos
--
--  Reglas:   docs/reglas-financieras.md (secciones 4, 5 y 8).
--  Rollback: supabase/rollback/20261024000002_analisis_config.down.sql
--  Tests:    tests/db/analisis-config.test.ts (+ analisis, reglas-financieras,
--            atajo, seguridad)
--
--  1. variacion_patrimonial: el patrimonio de partida incluye el saldo inicial
--     de las cuentas que empiezan DENTRO del periodo, en su fecha de partida.
--     Antes se contaban desde 0 y su saldo inicial aparecía como variación
--     (septiembre: +1.353,14 € con 1.013,42 € de saldos iniciales).
--     Por qué esta opción y no «primer mes · no comparable»:
--       · Sección 4: antes de su fecha de partida la cuenta no existe; en esa
--         fecha vale su saldo inicial. Ese saldo es el punto de partida, no una
--         ganancia del periodo.
--       · Sección 5: ΔPatrimonio = Balance + Revalorización + Ajustes. Con el
--         saldo inicial dentro del patrimonio de partida la igualdad se cumple
--         siempre, sin una cuarta pieza. Ocultar la variación del primer mes
--         perdería un dato que sí es correcto (lo que cambió desde que existen
--         las cuentas).
--       · Sección 8 (periodos comparables) se sigue aplicando a la comparativa
--         con el mes anterior: si no hay un mes anterior completo, no se compara.
--     `saldos_iniciales` se conserva: es la parte de patrimonio_inicial que
--     viene de cuentas que empiezan dentro del periodo (para explicarlo).
--     La firma no cambia (create or replace conserva los permisos).
--  2. traduccion_categoria: nombre de las categorías por defecto en es/en/ca
--     (el mismo texto que la web; un test lo compara con sus traducciones).
--  3. cascada_analisis: pasos del gráfico en cascada Ingresos → gasto por
--     categoría → Balance, con importes exactos y acumulados en SQL.
--  4. datos_analisis: añade, todo calculado en SQL y sin conceptos, comercios
--     ni notas (solo agregados): clave y nombre traducido (etiqueta) de cada
--     categoría, comparativa por categoría con el mes anterior (solo si es
--     comparable), el mayor gasto del mes (importe, día, categoría), el gasto
--     en fin de semana (total y por categoría), la cascada y los límites reales
--     (objetivos, con su clave).
--  5. Los análisis ya guardados se corrigen: patrimonio_inicial y variacion
--     pasan a la nueva base y se les añade la cascada. El texto de la IA no se
--     cambia (hay que regenerarlo para que lo cuente bien).
--  6. registrar_movimiento: la categoría del atajo se acepta por su nombre, su
--     clave o su nombre traducido (es/en/ca) si es una categoría por defecto.
--
--  Permisos: Supabase concede EXECUTE a PUBLIC, anon y authenticated sobre
--  toda función nueva. Al final se revoca y se concede solo lo necesario.
-- =====================================================================


-- ---------------------------------------------------------------- 1. Variación patrimonial
-- ΔPatrimonio = Patrimonio(D2) − Patrimonio de partida = Balance + Revalorización + Ajustes.
-- Patrimonio de partida = Patrimonio(D1) + saldo inicial de las cuentas con
-- fecha de partida en (D1, D2] (su valor el día en que empiezan a existir).
create or replace function variacion_patrimonial(p_d1 date, p_d2 date)
returns table (patrimonio_inicial numeric, patrimonio_final numeric, balance numeric,
               revalorizacion numeric, ajustes numeric, saldos_iniciales numeric, variacion numeric)
language sql stable set search_path = public as $$
  with
    r as (select * from resumen_periodo(p_d1 + 1, p_d2)),
    inv as (
      select coalesce(sum(revalorizacion(c.id, p_d1, p_d2)), 0.00) as reval
      from cuentas c
      where c.user_id = auth.uid() and c.tipo = 'inversion' and c.fecha_inicial <= p_d2
    ),
    nuevas as (
      select coalesce(sum(case when c.tipo = 'pasivo' then -c.saldo_inicial else c.saldo_inicial end), 0.00) as s
      from cuentas c
      where c.user_id = auth.uid() and c.fecha_inicial > p_d1 and c.fecha_inicial <= p_d2
    ),
    p as (select coalesce(patrimonio(p_d1), 0.00) as ini, coalesce(patrimonio(p_d2), 0.00) as fin)
  select p.ini + nuevas.s, p.fin, r.balance, inv.reval, r.ajustes, nuevas.s, p.fin - (p.ini + nuevas.s)
  from p, r, inv, nuevas
$$;


-- ---------------------------------------------------------------- 2. Nombres traducidos
-- Nombre de una categoría por defecto (clave) en un idioma. NULL si la clave o
-- el idioma no existen. Mismos textos que apps/web/src/shared/i18n/common/*.ts.
create function traduccion_categoria(p_clave text, p_idioma text) returns text
language sql immutable set search_path = public as $$
  select t.nombre
  from (values
    ('restaurantes',   'es', 'Restaurantes'),   ('restaurantes',   'en', 'Restaurants'),        ('restaurantes',   'ca', 'Restaurants'),
    ('ocio',           'es', 'Ocio'),           ('ocio',           'en', 'Leisure'),            ('ocio',           'ca', 'Oci'),
    ('transporte',     'es', 'Transporte'),     ('transporte',     'en', 'Transport'),          ('transporte',     'ca', 'Transport'),
    ('suscripciones',  'es', 'Suscripciones'),  ('suscripciones',  'en', 'Subscriptions'),      ('suscripciones',  'ca', 'Subscripcions'),
    ('otros_gastos',   'es', 'Otros gastos'),   ('otros_gastos',   'en', 'Other expenses'),     ('otros_gastos',   'ca', 'Altres despeses'),
    ('nomina',         'es', 'Nómina'),         ('nomina',         'en', 'Salary'),             ('nomina',         'ca', 'Nòmina'),
    ('otros_ingresos', 'es', 'Otros ingresos'), ('otros_ingresos', 'en', 'Other income'),       ('otros_ingresos', 'ca', 'Altres ingressos'),
    ('rendimientos',   'es', 'Rendimientos'),   ('rendimientos',   'en', 'Investment returns'), ('rendimientos',   'ca', 'Rendiments')
  ) as t (clave, idioma, nombre)
  where t.clave = p_clave and t.idioma = p_idioma
$$;


-- ---------------------------------------------------------------- 3. Cascada
-- Pasos del gráfico en cascada a partir de los ingresos, los gastos netos y
-- la lista de categorías del mes ([{nombre, clave, color, gasto}], gasto como
-- texto). Cada paso lleva inicio y fin acumulados (texto exacto):
--   ingresos (0 → I) · una barra por categoría (las 7 de más gasto; el resto
--   juntas como «otras») · «sin_categoria» si hay gasto sin categoría ·
--   balance (0 → I − gastos netos). Una categoría en negativo sube.
-- El último paso acumulado siempre termina en el balance: I − Σ categorías −
-- sin categoría = I − gastos netos.
create function cascada_analisis(p_ingresos numeric, p_gastos_netos numeric, p_categorias jsonb) returns jsonb
language sql immutable set search_path = public as $$
  with
    cats as (
      select c.v ->> 'nombre' as nombre, c.v ->> 'clave' as clave, c.v ->> 'color' as color,
             (c.v ->> 'gasto')::numeric as gasto
      from jsonb_array_elements(case when jsonb_typeof(p_categorias) = 'array' then p_categorias else '[]'::jsonb end) as c (v)
    ),
    ordenadas as (
      select cats.*, row_number() over (order by cats.gasto desc, cats.nombre) as rn
      from cats where cats.gasto <> 0
    ),
    pasos as (
      select o.rn as orden, 'categoria' as tipo, o.nombre, o.clave, o.color, o.gasto
      from ordenadas o where o.rn <= 7
      union all
      select 8, 'otras', null, null, null, sum(o.gasto)
      from ordenadas o where o.rn > 7
      having count(*) > 0
      union all
      select 9, 'sin_categoria', null, null, null, s.resto
      from (select p_gastos_netos - coalesce((select sum(cats.gasto) from cats), 0) as resto) s
      where s.resto <> 0
    ),
    acumulados as (
      select pasos.*, p_ingresos - sum(pasos.gasto) over (order by pasos.orden rows unbounded preceding) as fin
      from pasos
    )
  select jsonb_build_array(jsonb_build_object(
           'tipo', 'ingresos', 'nombre', null, 'clave', null, 'color', null,
           'importe', p_ingresos::text, 'inicio', '0.00', 'fin', p_ingresos::text))
      || coalesce((
           select jsonb_agg(jsonb_build_object(
                    'tipo', a.tipo, 'nombre', a.nombre, 'clave', a.clave, 'color', a.color,
                    'importe', (-a.gasto)::text, 'inicio', (a.fin + a.gasto)::text, 'fin', a.fin::text)
                  order by a.orden)
           from acumulados a), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
           'tipo', 'balance', 'nombre', null, 'clave', null, 'color', null,
           'importe', (p_ingresos - p_gastos_netos)::text, 'inicio', '0.00',
           'fin', (p_ingresos - p_gastos_netos)::text))
$$;


-- ---------------------------------------------------------------- 4. datos_analisis
-- Igual que en 20261020000000_correcciones.sql, con:
--   · categorías (del mes y del anterior) con `clave` y `etiqueta` (nombre en
--     el idioma del perfil; el de la base si no es una categoría por defecto);
--   · comparativa_categorias: las 10 categorías que más cambian frente al mes
--     anterior (solo si el mes anterior es completo, sección 8);
--   · mayor_gasto: el gasto más grande del mes (importe, fecha, día ISO de la
--     semana 1–7, categoría, % sobre los gastos del mes). Sin concepto;
--   · fin_de_semana: gasto neto de sábados y domingos, su % sobre los gastos
--     netos, los días de fin de semana del mes y las 5 categorías con más
--     gasto en fin de semana (con su % dentro de la categoría);
--   · cascada (cascada_analisis) y `variacion.base = 'partida'` (variación
--     desde la fecha de partida, ver 1);
--   · objetivos con la clave y la etiqueta de su categoría.
-- Porcentajes y variaciones con precisión completa: se redondean al mostrar.
create or replace function datos_analisis(p_mes date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid         uuid := auth.uid();
  v_mes         date;
  v_fin         date;
  v_ant         date;
  v_ant_fin     date;
  v_hoy         date;
  v_inicio      date;
  v_idioma      text;
  v_anterior    boolean;
  v_r           record;
  v_categorias  jsonb;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'Indica el mes' using errcode = '22023';
  end if;

  v_mes     := date_trunc('month', p_mes)::date;
  v_fin     := (v_mes + interval '1 month - 1 day')::date;
  v_ant     := (v_mes - interval '1 month')::date;
  v_ant_fin := v_mes - 1;
  v_hoy     := hoy_usuario();
  if v_mes > v_hoy then
    raise exception 'El mes % todavía no ha empezado', to_char(v_mes, 'YYYY-MM') using errcode = '22023';
  end if;

  select p.idioma into v_idioma from perfiles p where p.user_id = v_uid;
  v_idioma := coalesce(v_idioma, 'es');
  select min(c.fecha_inicial) into v_inicio from cuentas c where c.user_id = v_uid;
  select * into v_r from resumen_periodo(v_mes, v_fin);
  v_anterior := coalesce(v_inicio <= v_ant, false);

  select coalesce(jsonb_agg(
           jsonb_build_object('nombre', g.nombre, 'clave', g.clave, 'etiqueta', g.etiqueta,
                              'color', g.color, 'gasto', g.gasto::text)
           order by g.gasto desc, g.nombre), '[]'::jsonb)
    into v_categorias
  from (
    select left(x.nombre, 40) as nombre, c.clave,
           left(coalesce(traduccion_categoria(c.clave, v_idioma), x.nombre), 40) as etiqueta,
           case when x.color ~ '^#[0-9A-Fa-f]{6}$' then x.color end as color,
           x.gasto
    from gasto_por_categoria(v_mes, v_fin) x
    join categorias c on c.id = x.categoria_id and c.user_id = v_uid
    order by x.gasto desc, x.nombre
    limit 200
  ) g;

  return jsonb_build_object(
    'mes',            to_char(v_mes, 'YYYY-MM-DD'),
    'mes_incompleto', coalesce(v_inicio > v_mes, true),
    'idioma',         v_idioma,

    'resumen', jsonb_build_object(
      'ingresos', v_r.ingresos::text, 'gastos', v_r.gastos::text, 'devoluciones', v_r.devoluciones::text,
      'gastos_netos', v_r.gastos_netos::text, 'balance', v_r.balance::text,
      'ahorro_pct', v_r.ahorro_pct::text, 'ajustes', v_r.ajustes::text),

    'resumen_mes_anterior', (
      select jsonb_build_object(
        'ingresos', r.ingresos::text, 'gastos', r.gastos::text, 'devoluciones', r.devoluciones::text,
        'gastos_netos', r.gastos_netos::text, 'balance', r.balance::text,
        'ahorro_pct', r.ahorro_pct::text, 'ajustes', r.ajustes::text)
      from resumen_periodo(v_ant, v_ant_fin) r
      where v_anterior),

    'categorias', v_categorias,

    'categorias_mes_anterior', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', g.nombre, 'clave', g.clave, 'etiqueta', g.etiqueta,
                                  'color', g.color, 'gasto', g.gasto::text)
               order by g.gasto desc, g.nombre), '[]'::jsonb)
      from (
        select left(x.nombre, 40) as nombre, c.clave,
               left(coalesce(traduccion_categoria(c.clave, v_idioma), x.nombre), 40) as etiqueta,
               case when x.color ~ '^#[0-9A-Fa-f]{6}$' then x.color end as color,
               x.gasto
        from gasto_por_categoria(v_ant, v_ant_fin) x
        join categorias c on c.id = x.categoria_id and c.user_id = v_uid
        where v_anterior
        order by x.gasto desc, x.nombre
        limit 200
      ) g),

    'comparativa_categorias', (
      select coalesce(jsonb_agg(
               jsonb_build_object('nombre', k.nombre, 'clave', k.clave, 'etiqueta', k.etiqueta,
                                  'gasto', k.gasto::text, 'gasto_anterior', k.gasto_anterior::text,
                                  'diferencia', k.diferencia::text,
                                  'variacion_pct', variacion_porcentual(k.gasto, k.gasto_anterior)::text)
               order by abs(k.diferencia) desc, k.nombre), '[]'::jsonb)
      from (
        select left(c.nombre, 40) as nombre, c.clave,
               left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40) as etiqueta,
               coalesce(a.gasto, 0.00) as gasto,
               coalesce(p.gasto, 0.00) as gasto_anterior,
               coalesce(a.gasto, 0.00) - coalesce(p.gasto, 0.00) as diferencia
        from gasto_por_categoria(v_mes, v_fin) a
        full join gasto_por_categoria(v_ant, v_ant_fin) p using (categoria_id)
        join categorias c on c.id = categoria_id and c.user_id = v_uid
        where v_anterior
        order by abs(coalesce(a.gasto, 0.00) - coalesce(p.gasto, 0.00)) desc, c.nombre
        limit 10
      ) k),

    'mayor_gasto', (
      select jsonb_build_object(
               'importe', m.importe::text,
               'fecha', to_char(m.fecha, 'YYYY-MM-DD'),
               'dia_semana', to_char(m.fecha, 'ID'),
               'categoria', left(c.nombre, 40),
               'clave', c.clave,
               'etiqueta', left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40),
               'pct_gastos', case when v_r.gastos > 0 then (m.importe / v_r.gastos * 100)::text end)
      from movimientos m
      left join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
      where m.user_id = v_uid and m.tipo = 'gasto' and m.fecha between v_mes and v_fin
      order by m.importe desc, m.fecha, m.created_at, m.id
      limit 1),

    'fin_de_semana', (
      select jsonb_build_object(
               'gasto_neto', f.total::text,
               'pct', case when v_r.gastos_netos > 0 then (f.total / v_r.gastos_netos * 100)::text end,
               'dias', f.dias::text,
               'dias_mes', (v_fin - v_mes + 1)::text,
               'categorias', f.categorias)
      from (
        select
          coalesce((
            select sum(case when m.tipo = 'gasto' then m.importe else -m.importe end)
            from movimientos m
            where m.user_id = v_uid and m.tipo in ('gasto', 'devolucion')
              and m.fecha between v_mes and v_fin and extract(isodow from m.fecha) in (6, 7)), 0.00) as total,
          (select count(*) from generate_series(v_mes::timestamp, v_fin::timestamp, interval '1 day') d
           where extract(isodow from d) in (6, 7)) as dias,
          (select coalesce(jsonb_agg(
                    jsonb_build_object('nombre', w.nombre, 'clave', w.clave, 'etiqueta', w.etiqueta,
                                       'gasto_fin_de_semana', w.fds::text, 'gasto', w.total::text,
                                       'pct', (w.fds / w.total * 100)::text)
                    order by w.fds desc, w.nombre), '[]'::jsonb)
           from (
             select left(c.nombre, 40) as nombre, c.clave,
                    left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40) as etiqueta,
                    sum(case when extract(isodow from m.fecha) in (6, 7)
                             then case when m.tipo = 'gasto' then m.importe else -m.importe end
                             else 0 end) as fds,
                    sum(case when m.tipo = 'gasto' then m.importe else -m.importe end) as total
             from movimientos m
             join categorias c on c.id = m.categoria_id and c.user_id = m.user_id
             where m.user_id = v_uid and m.tipo in ('gasto', 'devolucion') and m.fecha between v_mes and v_fin
             group by c.id
             having sum(case when m.tipo = 'gasto' then m.importe else -m.importe end) > 0
                and sum(case when extract(isodow from m.fecha) in (6, 7)
                             then case when m.tipo = 'gasto' then m.importe else -m.importe end
                             else 0 end) > 0
             order by 4 desc, 1
             limit 5
           ) w) as categorias
      ) f),

    'metodos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('metodo', g.metodo::text, 'gasto', g.gasto::text)
               order by g.gasto desc, g.metodo::text), '[]'::jsonb)
      from gasto_por_metodo(v_mes, v_fin) g),

    'variacion', (
      select jsonb_build_object(
        'patrimonio_inicial', v.patrimonio_inicial::text, 'patrimonio_final', v.patrimonio_final::text,
        'balance', v.balance::text, 'revalorizacion', v.revalorizacion::text, 'ajustes', v.ajustes::text,
        'saldos_iniciales', v.saldos_iniciales::text, 'variacion', v.variacion::text, 'base', 'partida')
      from variacion_patrimonial(v_mes - 1, least(v_fin, v_hoy)) v),

    'cascada', cascada_analisis(v_r.ingresos, v_r.gastos_netos, v_categorias),

    'objetivos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('tipo', o.tipo, 'categoria', o.categoria, 'clave', o.clave,
                                  'etiqueta', o.etiqueta, 'importe', o.importe, 'actual', o.actual)
               order by o.tipo, o.categoria), '[]'::jsonb)
      from (
        select ob.tipo::text as tipo,
               left(c.nombre, 40) as categoria,
               c.clave,
               left(coalesce(traduccion_categoria(c.clave, v_idioma), c.nombre), 40) as etiqueta,
               ob.importe::text as importe,
               case when ob.tipo = 'ahorro_mensual' then v_r.balance::text
                    else coalesce(g.gasto, 0.00)::text end as actual
        from objetivos ob
        left join categorias c on c.id = ob.categoria_id and c.user_id = ob.user_id
        left join gasto_por_categoria(v_mes, v_fin) g on g.categoria_id = ob.categoria_id
        where ob.user_id = v_uid and ob.activo
        order by ob.tipo, c.nombre
        limit 50
      ) o)
  );
end $$;


-- ---------------------------------------------------------------- 5. Análisis ya guardados
-- Solo filas con la variación antigua (sin `base`) y con importes legibles.
-- patrimonio_inicial += saldos_iniciales; variacion −= saldos_iniciales.
update analisis_mensuales a
   set datos = jsonb_set(
                 jsonb_set(
                   jsonb_set(a.datos, '{variacion,patrimonio_inicial}',
                     to_jsonb(((a.datos #>> '{variacion,patrimonio_inicial}')::numeric
                               + (a.datos #>> '{variacion,saldos_iniciales}')::numeric)::text)),
                   '{variacion,variacion}',
                   to_jsonb(((a.datos #>> '{variacion,variacion}')::numeric
                             - (a.datos #>> '{variacion,saldos_iniciales}')::numeric)::text)),
                 '{variacion,base}', '"partida"')
 where jsonb_typeof(a.datos -> 'variacion') = 'object'
   and a.datos #>> '{variacion,base}' is null
   and coalesce(a.datos #>> '{variacion,patrimonio_inicial}', '') ~ '^-?\d+(\.\d+)?$'
   and coalesce(a.datos #>> '{variacion,saldos_iniciales}', '') ~ '^-?\d+(\.\d+)?$'
   and coalesce(a.datos #>> '{variacion,variacion}', '') ~ '^-?\d+(\.\d+)?$';

-- La cascada de los análisis guardados sale de su propio snapshot.
update analisis_mensuales a
   set datos = a.datos || jsonb_build_object('cascada', cascada_analisis(
                 (a.datos #>> '{resumen,ingresos}')::numeric,
                 (a.datos #>> '{resumen,gastos_netos}')::numeric,
                 a.datos -> 'categorias'))
 where jsonb_typeof(a.datos) = 'object'
   and not (a.datos ? 'cascada')
   and jsonb_typeof(a.datos -> 'categorias') = 'array'
   and coalesce(a.datos #>> '{resumen,ingresos}', '') ~ '^-?\d+(\.\d+)?$'
   and coalesce(a.datos #>> '{resumen,gastos_netos}', '') ~ '^-?\d+(\.\d+)?$'
   and not exists (
     select 1 from jsonb_array_elements(a.datos -> 'categorias') c (v)
     where coalesce(c.v ->> 'gasto', '') !~ '^-?\d+(\.\d+)?$');


-- ---------------------------------------------------------------- 6. Atajo: categorías traducidas
-- Igual que en el esquema inicial salvo el paso 6. create or replace conserva
-- los permisos (anon y authenticated, como siempre).
create or replace function registrar_movimiento(
  token     text,
  tipo      text,
  importe   text,
  concepto  text default null,
  categoria text default null,
  metodo    text default null,
  fecha     text default null,
  comercio  text default null,
  desde     text default null,
  hacia     text default null,
  clave     text default null
) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_user      uuid;
  v_token_id  uuid;
  v_tipo      tipo_movimiento;
  v_sentido   sentido_ajuste;
  v_importe   numeric;
  v_metodo    metodo_pago;
  v_cat       uuid;
  v_cat_nom   text;
  v_cat_in    text := nullif(btrim(coalesce(registrar_movimiento.categoria, '')), '');
  v_cuenta    uuid;
  v_destino   uuid;
  v_fecha     date;
  v_hora      time;
  v_zona      text;
  v_ahora     timestamp;
  v_comercio  text := nullif(btrim(coalesce(registrar_movimiento.comercio, '')), '');
  v_concepto  text := nullif(btrim(coalesce(registrar_movimiento.concepto, '')), '');
  v_clave     text := nullif(btrim(coalesce(registrar_movimiento.clave, '')), '');
  v_id        uuid;
  t_in        text := lower(btrim(coalesce(registrar_movimiento.tipo, '')));
  m_in        text := lower(btrim(coalesce(registrar_movimiento.metodo, '')));
begin
  -- 1. ¿Quién es? (token)
  select tk.id, tk.user_id into v_token_id, v_user
  from tokens_api tk
  where tk.token_hash = encode(sha256(convert_to(coalesce(registrar_movimiento.token, ''), 'UTF8')), 'hex')
    and not tk.revocado;
  if v_user is null then
    return json_build_object('ok', false, 'error', 'Token no válido. Revisa el token del atajo.');
  end if;

  -- 2. Reintento del mismo envío: devuelve el movimiento ya creado
  if v_clave is not null then
    select m.id into v_id from movimientos m where m.user_id = v_user and m.clave_idempotencia = v_clave;
    if v_id is not null then
      return json_build_object('ok', true, 'id', v_id, 'duplicado', true, 'mensaje', '✅ Ya estaba registrado');
    end if;
  end if;

  v_zona  := coalesce((select p.zona_horaria from perfiles p where p.user_id = v_user), 'Europe/Madrid');
  v_ahora := now() at time zone v_zona;

  -- 3. Tipo
  v_tipo := case
    when t_in in ('gasto') then 'gasto'
    when t_in in ('ingreso', 'rendimiento') then 'ingreso'
    when t_in in ('devolución', 'devolucion', 'reembolso') then 'devolucion'
    when t_in in ('traspaso', 'transferencia entre cuentas') then 'traspaso'
    when t_in in ('ajuste') then 'ajuste'
  end;
  if v_tipo is null then
    return json_build_object('ok', false, 'error', 'Tipo no reconocido: ' || coalesce(registrar_movimiento.tipo, '(vacío)'));
  end if;
  if t_in = 'rendimiento' and v_cat_in is null then
    v_cat_in := 'Rendimientos';
  end if;

  -- 4. Importe (siempre positivo; en un ajuste, el signo del texto decide si suma o resta)
  v_importe := leer_importe(registrar_movimiento.importe);
  if v_importe is null or v_importe <= 0 then
    return json_build_object('ok', false, 'error', 'Importe no válido: ' || coalesce(registrar_movimiento.importe, '(vacío)'));
  end if;
  if v_tipo = 'ajuste' then
    v_sentido := case when registrar_movimiento.importe like '%-%' then 'resta' else 'suma' end;
  end if;

  -- 5. Método
  v_metodo := case
    when m_in in ('tarjeta', 'card') then 'tarjeta'
    when m_in in ('apple pay', 'apple_pay', 'applepay') then 'apple_pay'
    when m_in in ('efectivo', 'cash') then 'efectivo'
    when m_in in ('transferencia') then 'transferencia'
    when m_in in ('bizum') then 'bizum'
    when m_in in ('domiciliación', 'domiciliacion', 'recibo') then 'domiciliacion'
    when m_in = '' then case when v_comercio is not null then 'apple_pay'::metodo_pago else 'tarjeta'::metodo_pago end
  end;
  if v_metodo is null then
    return json_build_object('ok', false, 'error', 'Método no reconocido: ' || registrar_movimiento.metodo);
  end if;

  -- 6. Categoría (por nombre o, en las de por defecto, por clave o nombre traducido; sin importar mayúsculas)
  if v_tipo in ('gasto', 'ingreso', 'devolucion') then
    -- Por nombre; si es una categoría por defecto, también por su clave o su
    -- nombre en es/en/ca. Si dos casan, gana la que se llama exactamente así.
    select c.id, c.nombre into v_cat, v_cat_nom
    from categorias c
    where c.user_id = v_user and not c.archivada
      and c.tipo = (case when v_tipo = 'ingreso' then 'ingreso' else 'gasto' end)::tipo_categoria
      and (lower(c.nombre) = lower(coalesce(v_cat_in, ''))
           or (c.clave is not null and lower(coalesce(v_cat_in, '')) in (
                 lower(c.clave), lower(replace(c.clave, '_', ' ')),
                 lower(traduccion_categoria(c.clave, 'es')),
                 lower(traduccion_categoria(c.clave, 'en')),
                 lower(traduccion_categoria(c.clave, 'ca')))))
    order by (lower(c.nombre) = lower(coalesce(v_cat_in, ''))) desc, c.orden, c.nombre
    limit 1;
    if v_cat is null then
      return json_build_object('ok', false, 'error',
        'Categoría no encontrada: ' || coalesce(v_cat_in, '(vacía)') || '. Válidas: ' ||
        coalesce((select string_agg(c.nombre, ', ' order by c.orden) from categorias c
                  where c.user_id = v_user and not c.archivada
                    and c.tipo = (case when v_tipo = 'ingreso' then 'ingreso' else 'gasto' end)::tipo_categoria), '(ninguna)'));
    end if;
  end if;

  -- 7. Cuentas
  if nullif(btrim(coalesce(registrar_movimiento.desde, '')), '') is not null then
    select cu.id into v_cuenta from cuentas cu where cu.user_id = v_user and lower(cu.nombre) = lower(btrim(registrar_movimiento.desde));
    if v_cuenta is null then return json_build_object('ok', false, 'error', 'Cuenta no encontrada: ' || registrar_movimiento.desde); end if;
  end if;
  if nullif(btrim(coalesce(registrar_movimiento.hacia, '')), '') is not null then
    select cu.id into v_destino from cuentas cu where cu.user_id = v_user and lower(cu.nombre) = lower(btrim(registrar_movimiento.hacia));
    if v_destino is null then return json_build_object('ok', false, 'error', 'Cuenta no encontrada: ' || registrar_movimiento.hacia); end if;
  end if;
  if v_tipo = 'traspaso' then
    if v_cuenta is null or v_destino is null or v_cuenta = v_destino then
      return json_build_object('ok', false, 'error', 'Un traspaso necesita "desde" y "hacia" con cuentas distintas.');
    end if;
  else
    -- Ingresos y devoluciones entran en "hacia"; gastos salen de "desde"
    if v_tipo in ('ingreso', 'devolucion', 'ajuste') and v_destino is not null then v_cuenta := v_destino; end if;
    v_destino := null;
    if v_cuenta is null then
      select cu.id into v_cuenta from cuentas cu
      where cu.user_id = v_user and not cu.archivada
        and (case when v_metodo = 'efectivo' then cu.tipo = 'efectivo' else cu.es_principal end)
      order by cu.orden limit 1;
    end if;
    if v_cuenta is null then
      return json_build_object('ok', false, 'error', 'No hay cuenta principal. Marca una cuenta con es_principal = true.');
    end if;
  end if;

  -- 8. Fecha: la que llegue (yyyy-MM-dd o ISO) o la de hoy en la zona del usuario
  begin
    if nullif(btrim(coalesce(registrar_movimiento.fecha, '')), '') is null then
      v_fecha := v_ahora::date; v_hora := v_ahora::time(0);
    elsif length(btrim(registrar_movimiento.fecha)) = 10 then
      v_fecha := btrim(registrar_movimiento.fecha)::date;
      if v_fecha = v_ahora::date then v_hora := v_ahora::time(0); end if;
    else
      v_fecha := (btrim(registrar_movimiento.fecha)::timestamptz at time zone v_zona)::date;
      v_hora  := (btrim(registrar_movimiento.fecha)::timestamptz at time zone v_zona)::time(0);
    end if;
  exception when others then
    return json_build_object('ok', false, 'error', 'Fecha no válida: ' || registrar_movimiento.fecha || ' (usa yyyy-MM-dd)');
  end;
  if v_fecha > v_ahora::date + 1 then
    return json_build_object('ok', false, 'error', 'La fecha está en el futuro: ' || v_fecha);
  end if;

  -- 9. Guardar (las reglas de la base devuelven un error legible)
  begin
    insert into movimientos (user_id, fecha, hora, concepto, comercio, tipo, importe, sentido, categoria_id, metodo,
                             cuenta_id, cuenta_destino_id, origen, clave_idempotencia)
    values (v_user, v_fecha, v_hora,
            coalesce(v_concepto, v_comercio, initcap(v_tipo::text)),
            v_comercio, v_tipo, v_importe, v_sentido, v_cat,
            case when v_tipo in ('traspaso', 'ajuste') then null else v_metodo end,
            v_cuenta, v_destino,
            (case when v_comercio is not null then 'apple_pay' else 'atajo' end)::origen_movimiento,
            v_clave)
    returning id into v_id;
  exception
    when unique_violation then
      select m.id into v_id from movimientos m where m.user_id = v_user and m.clave_idempotencia = v_clave;
      if v_id is not null then
        return json_build_object('ok', true, 'id', v_id, 'duplicado', true, 'mensaje', '✅ Ya estaba registrado');
      end if;
      return json_build_object('ok', false, 'error', 'Movimiento duplicado');
    when check_violation then
      return json_build_object('ok', false, 'error', sqlerrm);
  end;

  update tokens_api set ultimo_uso = now() where id = v_token_id;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'mensaje', '✅ ' ||
      case v_tipo when 'gasto' then 'Gasto' when 'ingreso' then 'Ingreso' when 'devolucion' then 'Devolución'
                  when 'traspaso' then 'Traspaso' else 'Ajuste' end
      || ' de ' || translate(to_char(v_importe, 'FM9G999G999G990D00'), ',.', '.,') || ' €'
      || coalesce(' · ' || v_cat_nom, '')
  );
end $$;


-- ---------------------------------------------------------------- Permisos de funciones
revoke execute on function
  traduccion_categoria(text, text),
  cascada_analisis(numeric, numeric, jsonb)
from public, anon, authenticated;

-- datos_analisis es security invoker: las llama con el rol del usuario.
grant execute on function
  traduccion_categoria(text, text),
  cascada_analisis(numeric, numeric, jsonb)
to authenticated;
