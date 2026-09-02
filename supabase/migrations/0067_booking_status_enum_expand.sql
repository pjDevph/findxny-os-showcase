-- =============================================================
-- 0052_booking_status_enum_expand.sql
-- Adds: expired, no_show, checked_in, checked_out to booking_status.
-- The GiST overlap-exclusion constraint update that uses 'checked_in'
-- moved to the front of 0068_turnaround_buffer.sql — Postgres forbids
-- using a new enum value in the same transaction that added it, and
-- each migration file runs as one transaction.
-- =============================================================

-- Add new enum values.
-- ADD VALUE is non-transactional in PostgreSQL and must not be wrapped
-- in an explicit BEGIN/COMMIT block. IF NOT EXISTS makes this idempotent.
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'no_show';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'checked_in';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'checked_out';
