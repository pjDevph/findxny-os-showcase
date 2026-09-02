---
table: rate_limit_buckets
domain: Workspace & Access
tags: [schema]
---

# rate_limit_buckets

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| key | text | NOT NULL | 🔑 |
| count | integer | NOT NULL |  |
| window_start | timestamp with time zone | NOT NULL |  |
