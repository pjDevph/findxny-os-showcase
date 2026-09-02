-- Shift handoff: lets pos-shift's open_shift reject opening a new shift while
-- one is already open for the branch, and lets the incoming cashier
-- acknowledge the outgoing cashier's closing count before their own shift
-- can start. cashier_id already exists but was never populated by
-- open_shift — backfilling it going forward makes "who acknowledged the
-- handoff" meaningful.

alter table shifts add column if not exists handoff_ack_at timestamptz;
alter table shifts add column if not exists handoff_ack_by uuid references auth.users(id) on delete set null;
