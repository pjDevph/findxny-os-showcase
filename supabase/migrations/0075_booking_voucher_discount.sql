-- Migration 0075: Add voucher/discount columns to bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS voucher_id      UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voucher_code    TEXT,
  ADD COLUMN IF NOT EXISTS discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_source TEXT
    CHECK (discount_source IN ('voucher'));
