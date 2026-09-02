---
table: recipe_items
domain: Catalog & Inventory
tags: [schema]
---

# recipe_items

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| product_id | uuid | NOT NULL |  |
| catalog_id | uuid | NOT NULL |  |
| qty_used | numeric | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |
| section | text | NOT NULL |  |

## References (outgoing FKs)

- `catalog_id` → [[inventory_catalog]].`id`
- `product_id` → [[products]].`id`
- `workspace_id` → [[workspaces]].`id`
