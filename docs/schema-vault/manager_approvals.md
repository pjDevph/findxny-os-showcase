---
table: manager_approvals
domain: Shifts & Cash Management
tags: [schema]
---

# manager_approvals

Domain: [[Shifts & Cash Management]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid |  |  |
| action_type | text | NOT NULL |  |
| target_type | text | NOT NULL |  |
| target_id | uuid | NOT NULL |  |
| requested_by | uuid | NOT NULL |  |
| approved_by | uuid |  |  |
| approved_at | timestamp with time zone |  |  |
| status | text | NOT NULL |  |
| reason | text |  |  |
| metadata | jsonb | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[refunds]].`manager_approval_id` → `id`
