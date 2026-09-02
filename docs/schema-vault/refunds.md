---
table: refunds
domain: Payments & Transactions
tags: [schema]
---

# refunds

Domain: [[Payments & Transactions]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| payment_id | uuid | NOT NULL |  |
| amount | numeric | NOT NULL |  |
| reason | text |  |  |
| status | text | NOT NULL |  |
| refunded_at | timestamp with time zone | NOT NULL |  |
| created_by | uuid |  |  |
| manager_approval_id | uuid |  |  |
| order_id | uuid |  |  |
| payment_intent_id | uuid |  |  |
| currency | text | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `manager_approval_id` → [[manager_approvals]].`id`
- `order_id` → [[orders]].`id`
- `payment_id` → [[payments]].`id`
- `payment_intent_id` → [[payment_intents]].`id`

## Referenced by (incoming FKs)

- [[stock_movements]].`refund_id` → `id`
