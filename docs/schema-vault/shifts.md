---
table: shifts
domain: Shifts & Cash Management
tags: [schema]
---

# shifts

Domain: [[Shifts & Cash Management]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid |  |  |
| device_id | uuid |  |  |
| cashier_id | uuid |  |  |
| cashier_name | text | NOT NULL |  |
| opening_float | numeric | NOT NULL |  |
| closing_float | numeric |  |  |
| expected_float | numeric |  |  |
| variance | numeric |  |  |
| opened_at | timestamp with time zone | NOT NULL |  |
| closed_at | timestamp with time zone |  |  |
| status | text | NOT NULL |  |
| notes | text |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| current_status | text |  |  |
| total_break_minutes | integer |  |  |
| last_clock_in_at | timestamp with time zone |  |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `device_id` → [[pos_devices]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[cash_drawer_events]].`shift_id` → `id`
- [[checklist_completions]].`shift_id` → `id`
- [[shift_events]].`shift_id` → `id`
