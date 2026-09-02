---
table: shift_events
domain: Shifts & Cash Management
tags: [schema]
---

# shift_events

Domain: [[Shifts & Cash Management]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| shift_id | uuid | NOT NULL |  |
| staff_id | uuid | NOT NULL |  |
| event_type | text | NOT NULL |  |
| event_timestamp | timestamp with time zone | NOT NULL |  |
| photo_url | text |  |  |
| photo_bucket_path | text |  |  |
| notes | text |  |  |
| location_lat | double precision |  |  |
| location_lon | double precision |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| updated_at | timestamp with time zone | NOT NULL |  |

## References (outgoing FKs)

- `shift_id` → [[shifts]].`id`
- `staff_id` → [[profiles]].`id`
- `workspace_id` → [[workspaces]].`id`
