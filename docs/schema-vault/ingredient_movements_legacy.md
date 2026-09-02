---
table: ingredient_movements_legacy
domain: Catalog & Inventory
tags: [schema]
---

# ingredient_movements_legacy

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| ingredient_id | uuid | NOT NULL |  |
| type | text | NOT NULL |  |
| quantity | numeric | NOT NULL |  |
| reason | text |  |  |
| user_id | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `ingredient_id` → [[inventory_catalog]].`id`
- `workspace_id` → [[workspaces]].`id`
