---
table: workspace_printers
domain: Workspace & Access
tags: [schema]
---

# workspace_printers

Domain: [[Workspace & Access]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| name | text | NOT NULL |  |
| type | text | NOT NULL |  |
| connection | text | NOT NULL |  |
| mac_address | text |  |  |
| ip_address | text |  |  |
| is_enabled | boolean | NOT NULL |  |
| is_default | boolean | NOT NULL |  |
| last_test | timestamp with time zone |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`
