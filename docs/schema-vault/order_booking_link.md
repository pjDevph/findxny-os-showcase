---
table: order_booking_link
domain: Orders & Kitchen
tags: [schema]
---

# order_booking_link

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| order_id | uuid | NOT NULL | 🔑 |
| booking_id | uuid | NOT NULL | 🔑 |

## References (outgoing FKs)

- `booking_id` → [[bookings]].`id`
- `order_id` → [[orders]].`id`
