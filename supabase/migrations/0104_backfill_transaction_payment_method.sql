-- 0100 added transactions.payment_method but never backfilled existing rows,
-- so the Reports "Payment Methods" breakdown shows ~97% as "Unknown" for any
-- transaction created before that column existed. Recover the real method
-- from payment_intents/payments where possible; leave genuinely unrecoverable
-- rows (bookings paid before payment_method tracking existed, and one refund
-- with no matching succeeded payment) as NULL rather than guessing.

-- Orders: transactions.reference_id -> payment_intents.order_id -> payments.method
UPDATE transactions t
SET payment_method = p.method
FROM payment_intents pi
JOIN payments p ON p.intent_id = pi.id AND p.status = 'succeeded'
WHERE t.payment_method IS NULL
  AND t.reference_table = 'orders'
  AND pi.order_id = t.reference_id;

-- Refunds: transactions.reference_id -> refunds.id -> refunds.payment_intent_id -> payments.method
UPDATE transactions t
SET payment_method = p.method
FROM refunds r
JOIN payments p ON p.intent_id = r.payment_intent_id AND p.status = 'succeeded'
WHERE t.payment_method IS NULL
  AND t.reference_table = 'refunds'
  AND r.id = t.reference_id;
