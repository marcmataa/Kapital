-- Rollback de 20261019000000_onboarding_y_analisis.sql
-- Deja intacto el esquema inicial. BORRA los análisis mensuales, la lista de
-- registro y las columnas onboarding_completado, entidad y color.
drop function if exists solicitar_regeneracion(date);
drop function if exists datos_analisis_usuario(uuid, date);
drop function if exists datos_analisis(date);
drop table if exists analisis_mensuales;
drop function if exists tocar_updated_at();

drop function if exists crear_banco(text, text, text, text);
drop function if exists completar_onboarding(text, jsonb, text);
drop function if exists leer_saldo(text);

drop trigger if exists kapital_crear_perfil on auth.users;
drop trigger if exists kapital_validar_registro on auth.users;
drop function if exists crear_perfil_usuario();
drop function if exists validar_registro();
drop table if exists registro_permitidos;
drop table if exists registro_config;

drop trigger if exists cuentas_limite_bancos on cuentas;
drop function if exists validar_limite_bancos();
drop function if exists nombre_entidad(text);
alter table cuentas drop column if exists color, drop column if exists entidad;

alter table perfiles drop column if exists onboarding_completado;
