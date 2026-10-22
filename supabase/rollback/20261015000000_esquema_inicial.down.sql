-- Rollback de 20261015000000_esquema_inicial.sql
-- BORRA TODOS LOS DATOS de Mis Finanzas. Haz un backup antes.
drop function if exists preparar_usuario(text, text);
drop function if exists registrar_movimiento(text, text, text, text, text, text, text, text, text, text, text);
drop function if exists crear_token(text);
drop function if exists leer_importe(text);
drop function if exists variacion_porcentual(numeric, numeric);
drop function if exists serie_patrimonio(date, date, date);
drop function if exists dia_equivalente_mes_anterior(date);
drop function if exists variacion_patrimonial(date, date);
drop function if exists revalorizacion(uuid, date, date);
drop function if exists gasto_por_metodo(date, date);
drop function if exists gasto_por_categoria(date, date);
drop function if exists resumen_mensual(date, date);
drop function if exists resumen_periodo(date, date);
drop view if exists v_saldos;
drop function if exists patrimonio(date);

drop view if exists v_efectos;

drop table if exists tokens_api;
drop table if exists objetivos;
drop table if exists valoraciones;
drop table if exists movimientos;
drop table if exists categorias;
drop table if exists cuentas;
drop function if exists valor_cuenta(uuid, date);
drop table if exists perfiles;

drop function if exists validar_cierre_cuenta();
drop function if exists proteger_cuenta_cerrada();
drop function if exists validar_cuenta();
drop function if exists validar_objetivo();
drop function if exists validar_valoracion();
drop function if exists validar_movimiento();
drop function if exists validar_perfil();
drop function if exists hoy_usuario();
drop function if exists fecha_local(timestamptz, text);

drop type if exists tipo_objetivo;
drop type if exists sentido_ajuste;
drop type if exists tipo_cuenta;
drop type if exists origen_movimiento;
drop type if exists tipo_categoria;
drop type if exists metodo_pago;
drop type if exists tipo_movimiento;
