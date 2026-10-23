-- Rollback de 20261023000002_estadisticas.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
-- Solo borra las funciones de lectura que añade la migración (no hay datos).

drop function if exists fuera_del_balance(date, date);
drop function if exists comparativa_estadisticas(date, date, date, date);
drop function if exists movimientos_por_dia(date, date);
