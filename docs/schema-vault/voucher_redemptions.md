---
table: voucher_redemptions
domain: Customers & Loyalty
tags: [schema]
---

# voucher_redemptions

Domain: [[Customers & Loyalty]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| voucher_id | uuid |  |  |
| order_id | uuid |  |  |
| customer_id | uuid |  |  |
| code_snapshot | text | NOT NULL |  |
| discount_amount | numeric | NOT NULL |  |
| order_total | numeric | NOT NULL |  |
| redeemed_by | uuid |  |  |
| redeemed_at | timestamp with time zone | NOT NULL |  |
| booking_id | uuid |  |  |

## References (outgoing FKs)

- `booking_id` → [[bookings]].`id`
- `customer_id` → [[customers]].`id`
- `order_id` → [[orders]].`id`
- `voucher_id` → [[vouchers]].`id`
- `workspace_id` → [[workspaces]].`id`
