---
table: receipts
domain: Orders & Kitchen
tags: [schema]
---

# receipts

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| transaction_id | uuid | NOT NULL |  |
| receipt_no | text | NOT NULL |  |
| payload | jsonb | NOT NULL |  |
| issued_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `transaction_id` → [[transactions]].`id`
- `workspace_id` → [[workspaces]].`id`
