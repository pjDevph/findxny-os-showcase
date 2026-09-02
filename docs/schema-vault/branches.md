---
table: branches
domain: Workspace & Access
tags: [schema]
---

# branches

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| address | text |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| accepting_orders | boolean | NOT NULL |  |
| accepting_bookings | boolean | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[bookable_resources]].`branch_id` → `id`
- [[bookings]].`branch_id` → `id`
- [[cash_drawer_events]].`branch_id` → `id`
- [[custom_charge_presets]].`branch_id` → `id`
- [[expenses]].`branch_id` → `id`
- [[inventory_items]].`branch_id` → `id`
- [[kitchen_tickets]].`branch_id` → `id`
- [[manager_approvals]].`branch_id` → `id`
- [[order_charges]].`branch_id` → `id`
- [[orders]].`branch_id` → `id`
- [[pos_devices]].`branch_id` → `id`
- [[resource_blocks]].`branch_id` → `id`
- [[shifts]].`branch_id` → `id`
- [[stock_movements]].`branch_id` → `id`
- [[task_checklists]].`branch_id` → `id`
- [[transactions]].`branch_id` → `id`
- [[workspace_members]].`branch_id` → `id`
- [[z_reports]].`branch_id` → `id`
