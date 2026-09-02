-- New workspaces previously defaulted to service_rate=0.10 (10%). Changing the
-- default to 0.05 (5%) per product decision — VAT stays at its existing
-- default (0.12 / 12%), since that's a fixed legal rate in the Philippines,
-- not a business preference, unlike service charge.
-- Only affects the column default for future INSERTs — existing workspaces'
-- rates are untouched (each owner can already toggle/edit theirs in
-- Settings -> Taxes & Charges).
ALTER TABLE workspaces
  ALTER COLUMN service_rate SET DEFAULT 0.05;
