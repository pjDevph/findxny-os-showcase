---
table: booking_payment_transactions
domain: Payments & Transactions
tags: [schema]
---

# booking_payment_transactions

Domain: [[Payments & Transactions]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| booking_id | uuid | NOT NULL |  |
| workspace_id | uuid | NOT NULL |  |
| amount | numeric | NOT NULL |  |
| method | text | NOT NULL |  |
| type | text | NOT NULL |  |
| reference | text |  |  |
| actor_id | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `booking_id` → [[bookings]].`id`
- `workspace_id` → [[workspaces]].`id`
