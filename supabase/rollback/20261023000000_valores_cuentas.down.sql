-- Rollback de 20261023000000_valores_cuentas.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso. Este va ANTES que
-- 20261020000000_correcciones.down.sql. No toca datos.

drop function if exists valores_cuentas(date);
