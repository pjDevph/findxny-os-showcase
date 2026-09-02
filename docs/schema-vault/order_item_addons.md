---
table: order_item_addons
domain: Orders & Kitchen
tags: [schema]
---

# order_item_addons

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| order_item_id | uuid | NOT NULL |  |
| addon_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| price | numeric | NOT NULL |  |
| qty | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `addon_id` → [[product_addons]].`id`
- `order_item_id` → [[order_items]].`id`
