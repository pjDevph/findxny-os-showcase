---
table: z_reports
domain: Shifts & Cash Management
tags: [schema]
---

# z_reports

Domain: [[Shifts & Cash Management]]

## Columns

| Column | Type | Nullable | PK |
|---|---|---|---|
| id | uuid | NOT NULL | 🔑 |
| workspace_id | uuid | NOT NULL |  |
| branch_id | uuid | NOT NULL |  |
| report_no | integer | NOT NULL |  |
| report_date | date | NOT NULL |  |
| report_type | text | NOT NULL |  |
| gross_sales | numeric | NOT NULL |  |
| discount_amount | numeric | NOT NULL |  |
| net_sales | numeric | NOT NULL |  |
| vatable_sales | numeric | NOT NULL |  |
| vat_amount | numeric | NOT NULL |  |
| vat_exempt_sales | numeric | NOT NULL |  |
| zero_rated_sales | numeric | NOT NULL |  |
| void_count | integer | NOT NULL |  |
| void_amount | numeric | NOT NULL |  |
| refund_count | integer | NOT NULL |  |
| refund_amount | numeric | NOT NULL |  |
| payment_breakdown | jsonb | NOT NULL |  |
| order_count | integer | NOT NULL |  |
| cancelled_count | integer | NOT NULL |  |
| first_receipt_no | text |  |  |
| last_receipt_no | text |  |  |
| opening_float | numeric | NOT NULL |  |
| cash_in | numeric | NOT NULL |  |
| cash_out | numeric | NOT NULL |  |
| expected_cash | numeric | NOT NULL |  |
| cashier_id | uuid |  |  |
| cashier_name | text |  |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone | NOT NULL |  |
| payload | jsonb |  |  |

## References (outgoing FKs)

- `branch_id` → [[branches]].`id`
- `workspace_id` → [[workspaces]].`id`
