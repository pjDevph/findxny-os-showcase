---
table: product_addon_groups
domain: Catalog & Inventory
tags: [schema]
---

# product_addon_groups

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| product_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| is_required | boolean | NOT NULL |  |
| min_select | integer | NOT NULL |  |
| max_select | integer | NOT NULL |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `product_id` → [[products]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[product_addons]].`group_id` → `id`
