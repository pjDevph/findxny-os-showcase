---
table: bookable_resources
domain: Bookings & Resources
tags: [schema]
---

# bookable_resources

Domain: [[Bookings & Resources]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| type | USER-DEFINED | NOT NULL |  |
| name | text | NOT NULL |  |
| capacity | integer | NOT NULL |  |
| hourly_rate | numeric | NOT NULL |  |
| active | boolean | NOT NULL |  |
| created_at | timestamp with time zone | NOT NULL |  |
| nightly_rate | numeric |  |  |
| short_description | text |  |  |
| description | text |  |  |
| base_pax | integer |  |  |
| max_pax | integer |  |  |
| extra_pax_fee | numeric |  |  |
| security_deposit | numeric |  |  |
| cleaning_fee | numeric |  |  |
| check_in_time | text |  |  |
| check_out_time | text |  |  |
| inclusions | jsonb | NOT NULL |  |
| photos | jsonb | NOT NULL |  |
| cover_photo | text |  |  |
| house_rules | text |  |  |
| min_nights | integer |  |  |
| turnaround_minutes | integer | NOT NULL |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `workspace_id` → [[workspaces]].`id`

## Referenced by (incoming FKs)

- [[bookings]].`resource_id` → `id`
- [[resource_blocks]].`resource_id` → `id`
