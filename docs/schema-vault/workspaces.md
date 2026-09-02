---
table: workspaces
domain: Workspace & Access
tags: [schema]
---

# workspaces

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| name | text | NOT NULL |  |
| slug | text | NOT NULL |  |
| currency | text | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
| tax_rate | numeric | NOT NULL |  |
| service_rate | numeric | NOT NULL |  |
| phone | text |  |  |
| hold_minutes | integer | NOT NULL |  |
| slot_minutes | integer | NOT NULL |  |
| receipt_address | text |  |  |
| receipt_tin | text |  |  |
| receipt_footer | text |  |  |
| payment_config | jsonb | NOT NULL |  |
| maintenance_mode | boolean | NOT NULL |  |
| maintenance_message | text |  |  |
| home_content | jsonb | NOT NULL |  |
| printer_config | jsonb |  |  |
| receipt_wifi_ssid | text |  |  |
| receipt_wifi_cred | text |  |  |
| receipt_promo_line | text |  |  |
| receipt_logo | text |  |  |
| receipt_order_prefix | text |  |  |

## Referenced by (incoming FKs)

- [[audit_logs]].`workspace_id` → `id`
- [[bookable_resources]].`workspace_id` → `id`
- [[booking_payment_transactions]].`workspace_id` → `id`
- [[bookings]].`workspace_id` → `id`
- [[branches]].`workspace_id` → `id`
- [[cash_drawer_events]].`workspace_id` → `id`
- [[checklist_completions]].`workspace_id` → `id`
- [[checklist_items]].`workspace_id` → `id`
- [[cost_items]].`workspace_id` → `id`
- [[custom_charge_presets]].`workspace_id` → `id`
- [[customer_points]].`workspace_id` → `id`
- [[customers]].`workspace_id` → `id`
- [[expense_categories]].`workspace_id` → `id`
- [[expenses]].`workspace_id` → `id`
- [[ingredient_movements_legacy]].`workspace_id` → `id`
- [[inventory_catalog]].`workspace_id` → `id`
- [[inventory_items]].`workspace_id` → `id`
- [[kitchen_tickets]].`workspace_id` → `id`
- [[loyalty_rules]].`workspace_id` → `id`
- [[manager_approvals]].`workspace_id` → `id`
- [[menu_book_hotspots]].`workspace_id` → `id`
- [[menu_book_pages]].`workspace_id` → `id`
- [[order_charges]].`workspace_id` → `id`
- [[orders]].`workspace_id` → `id`
- [[payment_intents]].`workspace_id` → `id`
- [[pos_devices]].`workspace_id` → `id`
- [[product_addon_groups]].`workspace_id` → `id`
- [[product_addons]].`workspace_id` → `id`
- [[product_categories]].`workspace_id` → `id`
- [[products]].`workspace_id` → `id`
- [[receipts]].`workspace_id` → `id`
- [[recipe_items]].`workspace_id` → `id`
- [[resource_blocks]].`workspace_id` → `id`
- [[shift_events]].`workspace_id` → `id`
- [[shifts]].`workspace_id` → `id`
- [[stock_movements]].`workspace_id` → `id`
- [[suppliers]].`workspace_id` → `id`
- [[task_checklists]].`workspace_id` → `id`
- [[transactions]].`workspace_id` → `id`
- [[voucher_redemptions]].`workspace_id` → `id`
- [[vouchers]].`workspace_id` → `id`
- [[workspace_members]].`workspace_id` → `id`
- [[workspace_printers]].`workspace_id` → `id`
- [[z_reports]].`workspace_id` → `id`
