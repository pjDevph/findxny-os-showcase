---
table: loyalty_rules
domain: Customers & Loyalty
tags: [schema]
---

# loyalty_rules

Domain: [[Customers & Loyalty]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| points_per_peso | numeric | NOT NULL |  |
| peso_per_point | numeric | NOT NULL |  |
| min_redeem_points | integer | NOT NULL |  |
| max_redeem_pct | numeric | NOT NULL |  |
| is_active | boolean | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`
