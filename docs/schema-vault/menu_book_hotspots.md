---
table: menu_book_hotspots
domain: Menu Book
tags: [schema]
---

# menu_book_hotspots

Domain: [[Menu Book]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| page_no | integer | NOT NULL |  |
| shape | text | NOT NULL |  |
| x | numeric | NOT NULL |  |
| y | numeric | NOT NULL |  |
| w | numeric | NOT NULL |  |
| h | numeric | NOT NULL |  |
| points | jsonb |  |  |
| blend_color | text |  |  |
| name | text | NOT NULL |  |
| price | numeric | NOT NULL |  |
| cat | text |  |  |
| product_id | uuid |  |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `product_id` → [[products]].`id`
- `workspace_id` → [[workspaces]].`id`
