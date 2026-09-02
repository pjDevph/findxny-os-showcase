-- payment_intents.provider was constrained to ('stripe','cash','xendit') — the
-- payment GATEWAY, not the customer-facing method. But this business has no
-- real gateway integration for GCash/Maya/card/QR PH/bank transfer: staff
-- manually verify a reference number at the counter and record it directly.
-- booking-epayment-confirm already tried to store that method as `provider`
-- (and payments-cash-confirm now does too for split/non-cash orders) — both
-- were failing with "invalid input value for enum payment_provider" for any
-- non-cash, non-xendit method. Add the methods actually in use so these
-- manual confirmations can succeed.
ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'gcash';
ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'maya';
ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'qrph';
ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'bank_transfer';
