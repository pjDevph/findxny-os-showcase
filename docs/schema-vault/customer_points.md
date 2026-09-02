---
table: customer_points
domain: Customers & Loyalty
tags: [schema]
---

# customer_points

Domain: [[Customers & Loyalty]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| customer_id | uuid | NOT NULL |  |
| order_id | uuid |  |  |
| type | text | NOT NULL |  |
| points | integer | NOT NULL |  |
| balance_after | integer | NOT NULL |  |
| notes | text |  |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `customer_id` → [[customers]].`id`
- `order_id` → [[orders]].`id`
- `workspace_id` → [[workspaces]].`id`
