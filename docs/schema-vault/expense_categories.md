---
table: expense_categories
domain: Expenses
tags: [schema]
---

# expense_categories

Domain: [[Expenses]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| description | text |  |  |
| is_active | boolean | NOT NULL |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[expenses]].`category_id` → `id`
