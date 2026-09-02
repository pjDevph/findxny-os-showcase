---
table: payment_intents
domain: Payments & Transactions
tags: [schema]
---

# payment_intents

Domain: [[Payments & Transactions]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| order_id | uuid |  |  |
| booking_id | uuid |  |  |
| provider | USER-DEFINED | NOT NULL |  |
| provider_intent_id | text |  |  |
| amount | numeric | NOT NULL |  |
| currency | text | NOT NULL |  |
| status | USER-DEFINED | NOT NULL |  |
| client_secret | text |  |  |
| metadata | jsonb | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `booking_id` → [[bookings]].`id`
- `order_id` → [[orders]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[payments]].`intent_id` → `id`
- [[refunds]].`payment_intent_id` → `id`
