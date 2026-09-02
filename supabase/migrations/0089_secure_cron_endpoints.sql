-- Migration 0089: Secure the pg_cron -> orders-auto-cancel HTTP call.
--
-- orders-auto-cancel was deployed with --no-verify-jwt (required, since
-- pg_cron's net.http_post call can't present a user JWT) but had NO auth
-- check of its own, so anyone on the internet could trigger it directly —
-- forcing real Xendit refunds workspace-wide with no rate limit. The
-- function now requires an `x-cron-secret` header (see requireCronSecret()
-- in supabase/functions/_shared/auth.ts); this reschedules the cron job to
-- send it.
--
-- IMPORTANT: set CRON_SECRET to this same value in the edge functions'
-- environment (Supabase dashboard -> Edge Functions -> Secrets, or via
-- `supabase secrets set CRON_SECRET=...`). Rotate by updating both this
-- header value and the CRON_SECRET secret together.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('auto-cancel-stale-orders'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule(
      'auto-cancel-stale-orders',
      '*/30 * * * *',
      $cron$
      SELECT net.http_post(
        url := '<SUPABASE_PROJECT_URL>/functions/v1/orders-auto-cancel?apikey=<SUPABASE_ANON_KEY>',
        headers := ('{"Content-Type":"application/json","x-cron-secret":"' || '<CRON_SECRET>' || '"}')::jsonb,
        body := '{"triggered_by":"cron"}'::jsonb
      ) AS request_id;
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
