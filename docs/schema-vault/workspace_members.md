---
table: workspace_members
domain: Workspace & Access
tags: [schema]
---

# workspace_members

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| workspace_id | uuid | NOT NULL | 🔑 |
| user_id | uuid | NOT NULL | 🔑 |
| role | USER-DEFINED | NOT NULL |  |
| branch_id | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| is_archived | boolean | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `user_id` → [[profiles]].`id`
- `workspace_id` → [[workspaces]].`id`
