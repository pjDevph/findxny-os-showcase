-- Xendit invoice webhooks are only deduped at the app layer today (payments-webhook
-- checks the current payment_intents.status before mutating). That's a
-- check-then-act race: two concurrent deliveries of the same event (Xendit's
-- own retry, or a duplicate delivery) can both read the pre-mutation status
-- before either commits, and both apply the side effects (payment rows,
-- transactions, receipts, loyalty-adjacent writes) twice.
--
-- This table lets the webhook handler claim an event atomically via a unique
-- constraint violation: the first delivery's INSERT succeeds and processing
-- proceeds, any concurrent/duplicate delivery's INSERT fails and is dropped
-- before touching payment_intents/orders/bookings at all.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL,
  -- e.g. "<xendit invoice id>:<status>" — a status transition, not just the
  -- invoice, since one invoice legitimately produces multiple distinct events
  -- (PENDING → PAID → ... ) that must each still be processed once.
  event_key   text NOT NULL,
  payload     jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_key_unique
  ON webhook_events (provider, event_key);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- Service-role only (edge functions use the admin client) — no public/authenticated policy.

-- Keep ~30 days for forensics (chasing down a disputed/duplicate charge), then drop.
create or replace function public.webhook_events_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.webhook_events where received_at < now() - interval '30 days';
$$;
grant execute on function public.webhook_events_cleanup() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('webhook_events_cleanup'); exception when others then null; end;
    perform cron.schedule(
      'webhook_events_cleanup',
      '31 3 * * *',
      $cron$select public.webhook_events_cleanup();$cron$
    );
  end if;
exception when others then null;
end $$;
