---
table: custom_charge_presets
domain: Orders & Kitchen
tags: [schema]
---

# custom_charge_presets

Domain: [[Orders & Kitchen]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid |  |  |
| name | text | NOT NULL |  |
| default_amount | numeric |  |  |
| taxable | boolean | NOT NULL |  |
| is_active | boolean | NOT NULL |  |
| sort_order | integer | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `workspace_id` → [[workspaces]].`id`
