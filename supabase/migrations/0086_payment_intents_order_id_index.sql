-- payment_intents is looked up by order_id on every receipt/transaction-detail
-- view (pos-data: "transactions-order-detail" and payment-status lookups), but
-- was only indexed on workspace_id and provider_intent_id — forcing a sequential
-- scan for the per-order lookup as the table grows.

CREATE INDEX IF NOT EXISTS idx_payment_intents_order_id
  ON payment_intents (order_id);
