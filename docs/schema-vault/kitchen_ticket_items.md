---
table: kitchen_ticket_items
domain: Orders & Kitchen
tags: [schema]
---

# kitchen_ticket_items

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| ticket_id | uuid | NOT NULL |  |
| order_item_id | uuid | NOT NULL |  |
| status | USER-DEFINED | NOT NULL |  |

## References (outgoing FKs)

- `order_item_id` → [[order_items]].`id`
- `ticket_id` → [[kitchen_tickets]].`id`
