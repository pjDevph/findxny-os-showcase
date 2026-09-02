---
table: auth_attempts
domain: Workspace & Access
tags: [schema]
---

# auth_attempts

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | bigint | NOT NULL | 🔑 |
| email | text | NOT NULL |  |
| ip | text |  |  |
| success | boolean | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
