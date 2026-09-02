-- Add payment_method to transactions so sales can be broken down by how they
-- were paid (dashboard, reports, transaction history). Nullable — refund/void
-- rows and legacy transactions predating this column carry no value and fall
-- back to "—" in the UI rather than being mislabeled.
alter table transactions
  add column if not exists payment_method text;

alter table transactions
  drop constraint if exists transactions_payment_method_check;
alter table transactions
  add constraint transactions_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'gcash', 'maya', 'card', 'qrph', 'bank_transfer', 'other'));
