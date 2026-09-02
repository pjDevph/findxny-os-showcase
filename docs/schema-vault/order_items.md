---
table: order_items
domain: Orders & Kitchen
tags: [schema]
---

# order_items

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| order_id | uuid | NOT NULL |  |
| product_id | uuid | NOT NULL |  |
| variant_id | uuid |  |  |
| quantity | integer | NOT NULL |  |
| unit_price | numeric | NOT NULL |  |
| total | numeric | NOT NULL |  |
| notes | text |  |  |
| status | text | NOT NULL |  |

## References (outgoing FKs)

- `order_id` → [[orders]].`id`
- `product_id` → [[products]].`id`
- `variant_id` → [[product_variants]].`id`

## Referenced by (incoming FKs)

- [[kitchen_ticket_items]].`order_item_id` → `id`
- [[order_item_addons]].`order_item_id` → `id`
