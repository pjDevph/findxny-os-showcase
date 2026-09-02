-- Add item-level status tracking for item-level cancellation flow.
-- Must be pasted into Supabase SQL editor.

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
CHECK (status IN ('active','preparing','ready','served','cancelled','voided'));

ALTER TABLE kitchen_ticket_items
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
CHECK (status IN ('active','preparing','ready','served','cancelled','voided'));
