-- 0021_xendit.sql — add xendit to payment_provider enum
ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'xendit';
