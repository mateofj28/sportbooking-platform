-- ============================================================
-- 060 · Los cron de Edge Functions se autentican con un secreto de Vault
--
-- Antes, los comandos de pg_cron tenían la service_role key escrita a mano (visible para
-- cualquiera con lectura de cron.job), y las funciones ni siquiera la revisaban
-- (verify_jwt = false): cualquiera podía dispararlas desde internet.
--
-- Ahora:
--   * El secreto 'cron_secret' vive en Supabase Vault (cifrado). Se crea aparte, nunca en
--     un archivo del repo; esta migración falla si todavía no existe.
--   * Cada corrida lo lee de vault.decrypted_secrets: el comando guardado en cron.job no
--     contiene ningún secreto.
--   * Las funciones exigen ese secreto (_shared/cron-auth.ts, variable CRON_SECRET).
--   * No es la service_role key: si se filtrara, solo permite disparar estos crons.
-- ============================================================

DO $$
DECLARE
  v_base text := 'https://olrmhtimfndshayvuowc.supabase.co/functions/v1/';
  j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    RAISE EXCEPTION 'Falta el secreto cron_secret en Vault: crearlo antes de aplicar esta migración';
  END IF;

  FOR j IN
    SELECT * FROM (VALUES
      ('cron-cancel-unpaid',        '0 * * * *'),
      ('cron-send-reminders',       '*/10 * * * *'),
      ('cron-notify-price-changes', '*/5 * * * *')
    ) AS t(name, schedule)
  LOOP
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = j.name;
    PERFORM cron.schedule(
      j.name,
      j.schedule,
      format(
        $cmd$SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
    'Content-Type', 'application/json'),
  timeout_milliseconds := 5000
)$cmd$,
        v_base || j.name)
    );
  END LOOP;
END $$;
