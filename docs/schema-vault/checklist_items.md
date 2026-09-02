---
table: checklist_items
domain: Tasks & Checklists
tags: [schema]
---

# checklist_items

Domain: [[Tasks & Checklists]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| checklist_id | uuid | NOT NULL |  |
| workspace_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| description | text |  |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `checklist_id` → [[task_checklists]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[checklist_completions]].`item_id` → `id`
