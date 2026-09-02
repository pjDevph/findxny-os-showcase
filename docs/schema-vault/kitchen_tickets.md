---
table: kitchen_tickets
domain: Orders & Kitchen
tags: [schema]
---

# kitchen_tickets

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| order_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| workspace_id | uuid | NOT NULL |  |
| status | USER-DEFINED | NOT NULL |  |
| started_at | timestamp with time zone |  |  |
| ready_at | timestamp with time zone |  |  |
| completed_at | timestamp with time zone |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| accepted_at | timestamp with time zone |  |  |
| served_at | timestamp with time zone |  |  |
| kitchen_status | text |  |  |
| station | text | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `order_id` → [[orders]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[kitchen_ticket_items]].`ticket_id` → `id`
