---
table: cost_items
domain: Catalog & Inventory
tags: [schema]
---

# cost_items

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| category | text | NOT NULL |  |
| name | text | NOT NULL |  |
| amount | numeric | NOT NULL |  |
| frequency | text | NOT NULL |  |
| notes | text |  |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`
