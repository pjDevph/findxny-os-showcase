---
table: customers
domain: Customers & Loyalty
tags: [schema]
---

# customers

Domain: [[Customers & Loyalty]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| profile_id | uuid |  |  |
| name | text | NOT NULL |  |
| phone | text |  |  |
| email | text |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| points_balance | integer | NOT NULL |  |

## References (outgoing FKs)

- `profile_id` → [[profiles]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[bookings]].`customer_id` → `id`
- [[customer_points]].`customer_id` → `id`
- [[orders]].`customer_id` → `id`
- [[voucher_redemptions]].`customer_id` → `id`
