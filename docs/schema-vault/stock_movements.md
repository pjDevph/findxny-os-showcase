---
table: stock_movements
domain: Catalog & Inventory
tags: [schema]
---

# stock_movements

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| inventory_item_id | uuid | NOT NULL |  |
| type | USER-DEFINED | NOT NULL |  |
| quantity | numeric | NOT NULL |  |
| reason | text |  |  |
| user_id | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| unit_cost | numeric |  |  |
| supplier | text |  |  |
| order_id | uuid |  |  |
| refund_id | uuid |  |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `inventory_item_id` → [[inventory_items]].`id`
- `order_id` → [[orders]].`id`
- `refund_id` → [[refunds]].`id`
- `workspace_id` → [[workspaces]].`id`
