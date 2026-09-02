-- =============================================================
--  ROOMS SEED  ·  paste into Supabase SQL Editor → Run
--  Seeds the 4 real Teepee glamping rooms from the official listing
--  (MugTheMug Staycation, Angono, Rizal).
--
--  bookable_resources has no unique constraint beyond its PK, so this
--  is NOT idempotent — re-running it creates duplicates. Run
--  rooms-delete.sql first if you need to re-seed.
--
--  Pricing uses the app's "Night Rate + Hourly Overage" mode: nightly_rate
--  is the base rate, hourly_rate (₱300) covers late check-out beyond the
--  12:00 NN check-out time.
--
--  Not represented — no columns exist for these yet, so they're folded
--  into `description` as free text instead of structured/billable fields:
--    · down payment / remaining balance schedule (only security_deposit
--      is a real column)
--    · tiered additional-guest pricing (only a single extra_pax_fee
--      column exists; using the adult rate, ₱500/pax)
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
  br UUID;

  incl_2pax JSONB := '[
    "Teepee accommodation for 2 pax with air conditioning",
    "Clean linens, pillows & blanket",
    "Towels provided",
    "Complimentary breakfast for all base guests",
    "Free Wi-Fi access",
    "Pool access (shared — available to 4 teepee rooms only)",
    "Shared bathroom & shower facilities"
  ]'::jsonb;

  incl_4pax JSONB := '[
    "Teepee accommodation for 4 pax with air conditioning",
    "Clean linens, pillows & blanket",
    "Towels provided",
    "Complimentary breakfast for all base guests",
    "Free Wi-Fi access",
    "Pool access (shared — available to 4 teepee rooms only)",
    "Shared bathroom & shower facilities"
  ]'::jsonb;

  house_rules TEXT := $rules$CANCELLATION POLICY
• 14+ days before check-in — Full refund
• 7–13 days before check-in — 50% refund
• Less than 7 days / no-show — Non-refundable

Private home-stay — treat the place as your own and practice CLEAN AS YOU GO. Situated among trees; expect birds, bees, butterflies, frogs & small insects — bring insect repellant. No swapping or adding guests during your stay. Premises are at guest's own risk — lock all doors; management is not liable for loss of personal belongings. Smoking strictly prohibited inside the teepee. Quiet hours: 11:00 PM – 7:00 AM.$rules$;

  deposit_note TEXT := $note$Down payment ₱1,000 to confirm reservation; remaining balance settled before check-in. Security deposit ₱1,000, refundable within 24–48 hrs after checkout. Additional guests (inclusive of breakfast): adult (13+) +₱500/pax, child (4–8) +₱300/pax, child (3 & under) free. Late check-out +₱300/hour, subject to availability.$note$;
BEGIN
  -- This workspace has more than one branch by now (Tagaytay Main from the
  -- base seed, plus Angono added later) — prefer the Angono branch since
  -- that's where this listing is for; fall back to the earliest branch if
  -- no Angono branch exists yet.
  SELECT id INTO br FROM branches
  WHERE workspace_id = ws
  ORDER BY (name ILIKE '%Angono%') DESC, created_at ASC
  LIMIT 1;

  IF br IS NULL THEN
    RAISE EXCEPTION 'No branch found for workspace %. Create a branch first.', ws;
  END IF;

  INSERT INTO bookable_resources (
    workspace_id, branch_id, type, name, capacity, base_pax, max_pax,
    hourly_rate, nightly_rate, extra_pax_fee, security_deposit,
    check_in_time, check_out_time, min_nights,
    short_description, description, inclusions, house_rules, active
  ) VALUES
    (ws, br, 'room', 'Teepee 1', 4, 4, 4,
     300, 7500, 500, 1000,
     '14:00', '12:00', 1,
     'Spacious Glamping for Groups', deposit_note, incl_4pax, house_rules, TRUE),

    (ws, br, 'room', 'Teepee 2', 2, 2, 2,
     300, 3500, 500, 1000,
     '14:00', '12:00', 1,
     'Cozy Glamping for Two', deposit_note, incl_2pax, house_rules, TRUE),

    (ws, br, 'room', 'Teepee 3', 2, 2, 2,
     300, 3500, 500, 1000,
     '14:00', '12:00', 1,
     'Cozy Glamping for Two', deposit_note, incl_2pax, house_rules, TRUE),

    (ws, br, 'room', 'Teepee 4', 2, 2, 2,
     300, 3500, 500, 1000,
     '14:00', '12:00', 1,
     'Cozy Glamping for Two', deposit_note, incl_2pax, house_rules, TRUE);

  RAISE NOTICE 'Seeded 4 Teepee rooms for branch %.', br;
END $$;
