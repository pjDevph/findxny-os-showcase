---
table: audit_logs
domain: Workspace & Access
tags: [schema]
---

# audit_logs

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| actor_id | uuid |  |  |
| action | text | NOT NULL |  |
| entity_type | text | NOT NULL |  |
| entity_id | uuid |  |  |
| before | jsonb |  |  |
| after | jsonb |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`
