---
table: pos_devices
domain: Workspace & Access
tags: [schema]
---

# pos_devices

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid |  |  |
| name | text | NOT NULL |  |
| device_type | text | NOT NULL |  |
| is_active | boolean | NOT NULL |  |
| last_seen_at | timestamp with time zone |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[shifts]].`device_id` → `id`
