---
table: vouchers
domain: Customers & Loyalty
tags: [schema]
---

# vouchers

Domain: [[Customers & Loyalty]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| code | text | NOT NULL |  |
| name | text | NOT NULL |  |
| description | text |  |  |
| discount_type | text | NOT NULL |  |
| discount_value | numeric | NOT NULL |  |
| max_cap | numeric |  |  |
| min_spend | numeric | NOT NULL |  |
| usage_limit | integer |  |  |
| usage_count | integer | NOT NULL |  |
| one_per_customer | boolean | NOT NULL |  |
| applies_to | text | NOT NULL |  |
| valid_from | timestamp with time zone |  |  |
| valid_until | timestamp with time zone |  |  |
| status | text | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[bookings]].`voucher_id` → `id`
- [[orders]].`voucher_id` → `id`
- [[voucher_redemptions]].`voucher_id` → `id`
