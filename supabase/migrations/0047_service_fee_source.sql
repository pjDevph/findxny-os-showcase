-- Add service_fee column to orders for accurate receipt reprints
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Schedule orders-auto-cancel edge function every 30 minutes via pg_cron
SELECT cron.schedule(
  'auto-cancel-stale-orders',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/orders-auto-cancel?apikey=<SUPABASE_ANON_KEY>',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"triggered_by":"cron"}'::jsonb
  ) AS request_id;
  $cron$
);
