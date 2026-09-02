---
table: idempotency_keys
domain: Workspace & Access
tags: [schema]
---

# idempotency_keys

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| key | text | NOT NULL | 🔑 |
| endpoint | text | NOT NULL |  |
| request_hash | text | NOT NULL |  |
| status | integer |  |  |
| response | jsonb |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
