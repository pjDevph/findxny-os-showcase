---
table: inventory_catalog
domain: Catalog & Inventory
tags: [schema]
---

# inventory_catalog

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| category | text | NOT NULL |  |
| unit | text | NOT NULL |  |
| low_stock_threshold | numeric | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |
| cost_per_unit | numeric | NOT NULL |  |
| archived | boolean | NOT NULL |  |
| supplier_id | uuid |  |  |
| supplier_sku | text |  |  |
| reorder_point | numeric |  |  |
| reorder_qty | numeric |  |  |
| expiry_date | date |  |  |
| batch_number | text |  |  |
| product_id | uuid |  |  |

## References (outgoing FKs)

- `product_id` → [[products]].`id`
- `supplier_id` → [[suppliers]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[ingredient_movements_legacy]].`ingredient_id` → `id`
- [[inventory_items]].`catalog_id` → `id`
- [[recipe_items]].`catalog_id` → `id`
