---
table: resource_blocks
domain: Bookings & Resources
tags: [schema]
---

# resource_blocks

Domain: [[Bookings & Resources]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid |  |  |
| resource_id | uuid | NOT NULL |  |
| start_date | date | NOT NULL |  |
| end_date | date | NOT NULL |  |
| block_type | text | NOT NULL |  |
| reason | text |  |  |
| is_active | boolean | NOT NULL |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `resource_id` → [[bookable_resources]].`id`
- `workspace_id` → [[workspaces]].`id`
