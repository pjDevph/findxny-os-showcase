---
table: product_variants
domain: Catalog & Inventory
tags: [schema]
---

# product_variants

Domain: [[Catalog & Inventory]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| product_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| price_delta | numeric | NOT NULL |  |

## References (outgoing FKs)

- `product_id` → [[products]].`id`

## Referenced by (incoming FKs)

- [[order_items]].`variant_id` → `id`
