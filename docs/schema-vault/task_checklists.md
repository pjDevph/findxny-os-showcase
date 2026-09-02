---
table: task_checklists
domain: Tasks & Checklists
tags: [schema]
---

# task_checklists

Domain: [[Tasks & Checklists]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid |  |  |
| name | text | NOT NULL |  |
| schedule | text | NOT NULL |  |
| assigned_role | text |  |  |
| is_active | boolean | NOT NULL |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[checklist_completions]].`checklist_id` → `id`
- [[checklist_items]].`checklist_id` → `id`
