-- Closes a TOCTOU race in pos-shift's open_shift handler: the pre-insert
-- "is this register already open" check and the insert itself are two
-- separate round trips with nothing enforcing atomicity between them, so
-- two near-simultaneous opens on the same register could both pass the
-- check and both insert. This partial unique index makes the DB the
-- authoritative guard — a second concurrent open now fails with a 23505
-- unique-violation, which pos-shift/index.ts catches and turns into the
-- same friendly "already open" conflict message.
create unique index if not exists shifts_one_open_per_register
  on shifts (register_id)
  where status = 'open';
