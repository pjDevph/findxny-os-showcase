---
table: bookings
domain: Bookings & Resources
tags: [schema]
---

# bookings

Domain: [[Bookings & Resources]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| resource_id | uuid | NOT NULL |  |
| customer_id | uuid |  |  |
| start_time | timestamp with time zone | NOT NULL |  |
| end_time | timestamp with time zone | NOT NULL |  |
| status | USER-DEFINED | NOT NULL |  |
| hold_expires_at | timestamp with time zone |  |  |
| total | numeric | NOT NULL |  |
| notes | text |  |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| checked_in_at | timestamp with time zone |  |  |
| payment_status | text | NOT NULL |  |
| rescheduled_from_booking_id | uuid |  |  |
| reschedule_count | integer | NOT NULL |  |
| checked_out_at | timestamp with time zone |  |  |
| cancelled_at | timestamp with time zone |  |  |
| cancellation_reason | text |  |  |
| guest_name | text |  |  |
| guest_phone | text |  |  |
| guest_email | text |  |  |
| amount_paid | numeric | NOT NULL |  |
| voucher_id | uuid |  |  |
| voucher_code | text |  |  |
| discount | numeric | NOT NULL |  |
| discount_source | text |  |  |
| rescheduled_to_booking_id | uuid |  |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `customer_id` → [[customers]].`id`
- `rescheduled_from_booking_id` → [[bookings]].`id`
- `rescheduled_to_booking_id` → [[bookings]].`id`
- `resource_id` → [[bookable_resources]].`id`
- `voucher_id` → [[vouchers]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[booking_payment_transactions]].`booking_id` → `id`
- [[bookings]].`rescheduled_from_booking_id` → `id`
- [[bookings]].`rescheduled_to_booking_id` → `id`
- [[order_booking_link]].`booking_id` → `id`
- [[payment_intents]].`booking_id` → `id`
- [[voucher_redemptions]].`booking_id` → `id`
