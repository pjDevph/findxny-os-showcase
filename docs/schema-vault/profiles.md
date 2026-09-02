---
table: profiles
domain: Workspace & Access
tags: [schema]
---

# profiles

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| full_name | text |  |  |
| phone | text |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| username | text |  |  |
| is_pos_staff | boolean | NOT NULL |  |

## Referenced by (incoming FKs)

- [[customers]].`profile_id` → `id`
- [[shift_events]].`staff_id` → `id`
- [[workspace_members]].`user_id` → `id`
