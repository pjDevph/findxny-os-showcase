---
table: inventory_items
domain: Catalog & Inventory
tags: [schema]
---

# inventory_items

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| quantity | numeric | NOT NULL |  |
| low_stock_threshold | numeric | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |
| catalog_id | uuid | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `catalog_id` → [[inventory_catalog]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[stock_movements]].`inventory_item_id` → `id`
