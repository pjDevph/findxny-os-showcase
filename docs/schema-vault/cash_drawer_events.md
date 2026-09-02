---
table: cash_drawer_events
domain: Shifts & Cash Management
tags: [schema]
---

# cash_drawer_events

Domain: [[Shifts & Cash Management]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| shift_id | uuid |  |  |
| branch_id | uuid |  |  |
| type | text | NOT NULL |  |
| amount | numeric | NOT NULL |  |
| reason | text |  |  |
| reference_id | uuid |  |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `shift_id` → [[shifts]].`id`
- `workspace_id` → [[workspaces]].`id`
