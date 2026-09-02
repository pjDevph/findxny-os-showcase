-- payment_intents.provider_intent_id (the gateway's invoice/charge id) was only
-- indexed for lookup speed, not uniqueness — nothing at the DB layer stopped a
-- retried/duplicate request from creating two payment_intents rows pointing at
-- the same Xendit invoice. Each intent gets its provider_intent_id from a
-- fresh gateway invoice created for that specific intent (see createInvoice/
-- createBookingInvoice in supabase/functions/_shared/xenditClient.ts), so two
-- rows sharing one id would always indicate a duplicate, never a legitimate
-- reuse. NULLs (cash/counter payments, or a digital intent before its invoice
-- is created) are excluded and remain unrestricted.
-- If this migration fails with a "duplicate key" error, real duplicates
-- already exist — find them before retrying:
--   SELECT provider_intent_id, array_agg(id), count(*)
--   FROM payment_intents WHERE provider_intent_id IS NOT NULL
--   GROUP BY provider_intent_id HAVING count(*) > 1;
-- Each duplicate needs a manual look (which row is the real one, whether the
-- other represents an actual double charge to refund) before this can apply.
DROP INDEX IF EXISTS payment_intents_provider_intent_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_intent_id_unique
  ON payment_intents (provider_intent_id)
  WHERE provider_intent_id IS NOT NULL;
