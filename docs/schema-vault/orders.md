---
table: orders
domain: Orders & Kitchen
tags: [schema]
---

# orders

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| order_no | text | NOT NULL |  |
| customer_id | uuid |  |  |
| type | USER-DEFINED | NOT NULL |  |
| status | USER-DEFINED | NOT NULL |  |
| subtotal | numeric | NOT NULL |  |
| tax | numeric | NOT NULL |  |
| total | numeric | NOT NULL |  |
| notes | text |  |  |
| table_no | text |  |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| qr_table | text |  |  |
| order_type | text |  |  |
| ticket_no | text |  |  |
| payment_status | text |  |  |
| source | text |  |  |
| discount | numeric | NOT NULL |  |
| service_fee | numeric | NOT NULL |  |
| cashier_id | uuid |  |  |
| balance_due | numeric | NOT NULL |  |
| cancelled_at | timestamp with time zone |  |  |
| cancelled_by | uuid |  |  |
| cancel_reason | text |  |  |
| is_senior_pwd | boolean | NOT NULL |  |
| voucher_id | uuid |  |  |
| voucher_code | text |  |  |
| discount_source | text |  |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `customer_id` → [[customers]].`id`
- `voucher_id` → [[vouchers]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[customer_points]].`order_id` → `id`
- [[kitchen_tickets]].`order_id` → `id`
- [[order_booking_link]].`order_id` → `id`
- [[order_charges]].`order_id` → `id`
- [[order_items]].`order_id` → `id`
- [[payment_intents]].`order_id` → `id`
- [[refunds]].`order_id` → `id`
- [[stock_movements]].`order_id` → `id`
- [[voucher_redemptions]].`order_id` → `id`
