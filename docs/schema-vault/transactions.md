---
table: transactions
domain: Payments & Transactions
tags: [schema]
---

# transactions

Domain: [[Payments & Transactions]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| type | USER-DEFINED | NOT NULL |  |
| reference_table | text | NOT NULL |  |
| reference_id | uuid | NOT NULL |  |
| amount | numeric | NOT NULL |  |
| status | USER-DEFINED | NOT NULL |  |
| created_by | uuid |  |  |
| voided_by | uuid |  |  |
| voided_reason | text |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[receipts]].`transaction_id` → `id`
