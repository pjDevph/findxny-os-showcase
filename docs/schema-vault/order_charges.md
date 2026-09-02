---
table: order_charges
domain: Orders & Kitchen
tags: [schema]
---

# order_charges

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid |  |  |
| order_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| amount | numeric | NOT NULL |  |
| taxable | boolean | NOT NULL |  |
| preset_id | uuid |  |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `order_id` → [[orders]].`id`
- `workspace_id` → [[workspaces]].`id`
