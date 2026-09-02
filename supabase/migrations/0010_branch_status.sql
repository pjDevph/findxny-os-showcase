-- 0010_branch_status.sql — add accepting_orders / accepting_bookings flags to branches.
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS accepting_orders   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepting_bookings boolean NOT NULL DEFAULT true;
