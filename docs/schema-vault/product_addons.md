---
table: product_addons
domain: Catalog & Inventory
tags: [schema]
---

# product_addons

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| group_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| price | numeric | NOT NULL |  |
| is_active | boolean | NOT NULL |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `group_id` → [[product_addon_groups]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[order_item_addons]].`addon_id` → `id`
