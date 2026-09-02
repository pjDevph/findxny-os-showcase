---
table: menu_book_pages
domain: Menu Book
tags: [schema]
---

# menu_book_pages

Domain: [[Menu Book]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| page_no | integer | NOT NULL |  |
| label | text | NOT NULL |  |
| file_name | text |  |  |
| image_path | text |  |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`
