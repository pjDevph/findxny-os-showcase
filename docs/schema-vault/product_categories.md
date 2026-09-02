---
table: product_categories
domain: Catalog & Inventory
tags: [schema]
---

# product_categories

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[products]].`category_id` → `id`
