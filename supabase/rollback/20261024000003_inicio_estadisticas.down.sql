-- Rollback de 20261024000003_inicio_estadisticas.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
-- Solo borra las funciones de lectura que añade la migración (no hay datos).

drop function if exists peso_otros_gastos(date, date);
drop function if exists ritmo_gasto(date, date, date, date);
drop function if exists progreso_objetivos(date);
