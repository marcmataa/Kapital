-- Rollback de 20261102000002_devoluciones_revision.sql
--
-- ORDEN: los scripts down se ejecutan en orden inverso; este va el primero.
-- No toca datos: la migración solo añadía una función de lectura.

drop function if exists devoluciones_pendientes_revision();
