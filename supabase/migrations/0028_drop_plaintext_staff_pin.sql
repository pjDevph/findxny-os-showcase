-- Drop plaintext staff_pin mirror.
-- PIN authentication is handled by Supabase Auth (bcrypt-hashed password on
-- the synthetic `<workspace>_<username>@staff.pos` user). The `profiles.staff_pin`
-- column existed only so admins could re-view a member's PIN — which made it a
-- plaintext mirror of an auth credential. Standard practice: admins reset, not view.

alter table profiles drop column if exists staff_pin;
