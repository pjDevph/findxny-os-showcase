---
table: suppliers
domain: Catalog & Inventory
tags: [schema]
---

# suppliers

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| contact_name | text |  |  |
| phone | text |  |  |
| email | text |  |  |
| address | text |  |  |
| notes | text |  |  |
| is_active | boolean | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[inventory_catalog]].`supplier_id` → `id`
