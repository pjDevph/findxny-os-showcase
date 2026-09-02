---
table: products
domain: Catalog & Inventory
tags: [schema]
---

# products

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| category_id | uuid |  |  |
| name | text | NOT NULL |  |
| sku | text |  |  |
| price | numeric | NOT NULL |  |
| kitchen_required | boolean | NOT NULL |  |
| active | boolean | NOT NULL |  |
| image_url | text |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| featured | boolean | NOT NULL |  |
| featured_tag | text |  |  |
| featured_blurb | text |  |  |
| featured_sort | integer |  |  |
| description | text |  |  |
| available | boolean | NOT NULL |  |
| cost | numeric | NOT NULL |  |
| archived | boolean | NOT NULL |  |
| for_sale | boolean | NOT NULL |  |
| barcode | text |  |  |
| selling_unit | text | NOT NULL |  |
| stock_auto_deactivated | boolean | NOT NULL |  |
| is_pinned | boolean | NOT NULL |  |
| category | text |  |  |
| purchase_unit | text | NOT NULL |  |
| prep_station | text |  |  |
| updated_at | timestamp with time zone | NOT NULL |  |
| track_inventory | boolean | NOT NULL |  |

## References (outgoing FKs)

- `category_id` → [[product_categories]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[inventory_catalog]].`product_id` → `id`
- [[menu_book_hotspots]].`product_id` → `id`
- [[order_items]].`product_id` → `id`
- [[product_addon_groups]].`product_id` → `id`
- [[product_variants]].`product_id` → `id`
- [[recipe_items]].`product_id` → `id`
