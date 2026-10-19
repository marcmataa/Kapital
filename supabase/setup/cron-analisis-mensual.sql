-- =====================================================================
--  Kapital · Programación del análisis mensual (pg_cron + pg_net)
--
--  NO es una migración: se ejecuta A MANO, una vez, en el SQL Editor de
--  Supabase (Dashboard → SQL Editor). Ningún secreto va escrito aquí: la URL
--  del proyecto y el CRON_SECRET se leen de Supabase Vault en cada ejecución.
--
--  Antes de ejecutar este script:
--
--  1) Despliega la Edge Function `analisis-mensual` y define sus secretos en
--     Dashboard → Edge Functions → Secrets: OPENAI_API_KEY y CRON_SECRET.
--     Para CRON_SECRET usa un valor largo y aleatorio (p. ej. 64 caracteres
--     hexadecimales generados con un gestor de contraseñas).
--
--  2) Guarda en Vault los tres valores que necesita el cron. Escríbelos tú
--     directamente en el SQL Editor (nunca en el repo ni en un chat):
--
--       select vault.create_secret('https://<ref-del-proyecto>.supabase.co', 'kapital_project_url',
--                                  'URL del proyecto para el cron del análisis mensual');
--       select vault.create_secret('<el mismo valor que CRON_SECRET>', 'kapital_cron_secret',
--                                  'Cabecera x-cron-secret de la Edge Function analisis-mensual');
--       select vault.create_secret('<clave anon (pública) del proyecto>', 'kapital_anon_key',
--                                  'Clave anon: la Edge Function mantiene activa la verificación de JWT');
--
--     Comprueba que existen (sin mostrar el valor):
--       select name, created_at from vault.secrets where name like 'kapital_%';
--
--     Para cambiar uno más adelante:
--       select vault.update_secret(
--         (select id from vault.secrets where name = 'kapital_cron_secret'), '<nuevo valor>');
--
--  3) Ejecuta este script entero. Es idempotente: si el trabajo ya existe,
--     cron.schedule lo actualiza.
--
--  Cuándo se ejecuta: el día 1 de cada mes a las 06:00 UTC (07:00 u 08:00 en
--  Madrid), y analiza el mes anterior.
--
--  Comprobar:
--    select jobid, jobname, schedule, active from cron.job where jobname = 'kapital-analisis-mensual';
--    select status, return_message, start_time from cron.job_run_details
--      where jobid = (select jobid from cron.job where jobname = 'kapital-analisis-mensual')
--      order by start_time desc limit 5;
--    select id, status_code, created from net._http_response order by created desc limit 5;
--
--  Desprogramar:
--    select cron.unschedule('kapital-analisis-mensual');
--
--  Probar ahora sin esperar al día 1: copia el `select net.http_post(...)` de
--  abajo y ejecútalo suelto.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Falla aquí, y no el día 1, si falta algún secreto en Vault.
do $$
begin
  if (select count(*) from vault.decrypted_secrets
      where name in ('kapital_project_url', 'kapital_cron_secret', 'kapital_anon_key')
        and coalesce(btrim(decrypted_secret), '') <> '') < 3 then
    raise exception 'Faltan los secretos kapital_project_url, kapital_cron_secret o kapital_anon_key en Vault (paso 2).';
  end if;
end $$;

select cron.schedule(
  'kapital-analisis-mensual',
  '0 6 1 * *',
  $cron$
  select net.http_post(
    url     := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'kapital_project_url'), '/')
               || '/functions/v1/analisis-mensual',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'kapital_anon_key'),
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kapital_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cron$
);
