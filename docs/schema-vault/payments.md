---
table: payments
domain: Payments & Transactions
tags: [schema]
---

# payments

Domain: [[Payments & Transactions]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| intent_id | uuid | NOT NULL |  |
| amount | numeric | NOT NULL |  |
| method | text | NOT NULL |  |
| status | USER-DEFINED | NOT NULL |  |
| paid_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `intent_id` → [[payment_intents]].`id`

## Referenced by (incoming FKs)

- [[refunds]].`payment_id` → `id`
