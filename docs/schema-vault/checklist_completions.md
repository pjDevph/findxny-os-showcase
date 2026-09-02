---
table: checklist_completions
domain: Tasks & Checklists
tags: [schema]
---

# checklist_completions

Domain: [[Tasks & Checklists]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| checklist_id | uuid | NOT NULL |  |
| item_id | uuid | NOT NULL |  |
| workspace_id | uuid | NOT NULL |  |
| completed_by | uuid | NOT NULL |  |
| completed_at | timestamp with time zone | NOT NULL |  |
| shift_id | uuid |  |  |
| notes | text |  |  |

## References (outgoing FKs)

- `checklist_id` → [[task_checklists]].`id`
- `item_id` → [[checklist_items]].`id`
- `shift_id` → [[shifts]].`id`
- `workspace_id` → [[workspaces]].`id`
