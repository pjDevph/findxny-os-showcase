-- reset.sql — wipes all custom schema objects.
-- Run this in the Supabase SQL editor FIRST, then re-run migrations 0001 → 0014 in order.

-- Triggers on auth schema
drop trigger if exists on_auth_user_created on auth.users;

-- Triggers on public tables
drop trigger if exists trg_deduct_ingredients on order_items;
drop trigger if exists trg_deduct_ingredients on orders;
drop trigger if exists trg_recalc_product_costs on ingredients;

-- pg_cron schedule (safe no-op if pg_cron not installed)
do $$ begin
  perform cron.unschedule('cancel-expired-holds');
exception when others then null;
end $$;

-- Functions
drop function if exists deduct_ingredients_on_order()   cascade;
drop function if exists recalculate_product_costs()     cascade;
drop function if exists cancel_expired_holds()          cascade;
drop function if exists next_kiosk_ticket()             cascade;
drop function if exists get_workspace_staff(uuid)       cascade;
drop function if exists get_auth_user_id_by_email(text) cascade;
drop function if exists is_workspace_member(uuid, workspace_role[]) cascade;
drop function if exists current_user_role(uuid)         cascade;
drop function if exists handle_new_user()               cascade;

-- Tables — leaf → root (cascade handles remaining FK deps)
drop table if exists ingredient_movements          cascade;
drop table if exists product_recipes               cascade;
drop table if exists recipe_items                  cascade;
drop table if exists cost_items                    cascade;
drop table if exists audit_logs                    cascade;
drop table if exists receipts                      cascade;
drop table if exists transactions                  cascade;
drop table if exists refunds                       cascade;
drop table if exists payments                      cascade;
drop table if exists payment_intents               cascade;
drop table if exists kitchen_ticket_items          cascade;
drop table if exists kitchen_tickets               cascade;
drop table if exists order_booking_link            cascade;
drop table if exists order_items                   cascade;
drop table if exists orders                        cascade;
drop table if exists bookings                      cascade;
drop table if exists bookable_resources            cascade;
drop table if exists stock_movements               cascade;
drop table if exists inventory_items               cascade;
drop table if exists ingredients                   cascade;
drop table if exists product_variants              cascade;
drop table if exists products                      cascade;
drop table if exists product_categories            cascade;
drop table if exists customers                     cascade;
drop table if exists cash_drawer_events            cascade;
drop table if exists shifts                        cascade;
drop table if exists pos_devices                   cascade;
drop table if exists workspace_members             cascade;
drop table if exists profiles                      cascade;
drop table if exists branches                      cascade;
drop table if exists workspaces                    cascade;

-- Sequences
drop sequence if exists order_no_seq        cascade;
drop sequence if exists transaction_ref_seq cascade;
drop sequence if exists receipt_no_seq      cascade;
drop sequence if exists kiosk_ticket_seq    cascade;

-- Enums
drop type if exists workspace_role        cascade;
drop type if exists order_type            cascade;
drop type if exists order_status          cascade;
drop type if exists booking_status        cascade;
drop type if exists resource_type         cascade;
drop type if exists kitchen_status        cascade;
drop type if exists payment_provider      cascade;
drop type if exists payment_intent_status cascade;
drop type if exists stock_movement_type   cascade;
drop type if exists transaction_type      cascade;
drop type if exists transaction_status    cascade;
