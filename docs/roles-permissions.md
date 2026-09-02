# Roles & Permissions

Roles: `owner`, `admin`, `manager`, `cashier`, `kitchen`.

## Backend permission groups

| Group | Roles | Used for |
|---|---|---|
| `STAFF_WRITE` | owner, admin, manager, cashier | order/counter/staff operational writes |
| `CATALOG_WRITE` | owner, admin, manager | product, ingredient, inventory, costing management |
| `KITCHEN_WRITE` | owner, admin, manager, kitchen | kitchen status updates |
| `VOID_REFUND` | owner, admin, manager | voids and refunds |
| `ADMIN_ONLY` | owner, admin | staff/admin settings/audit-sensitive operations |
| `OWNER_ONLY` | owner | owner-only workspace controls |

## POS route access

| Route | Allowed roles |
|---|---|
| order, counter, shift, transactions | owner, admin, manager, cashier |
| kitchen | owner, admin, manager, kitchen |
| products, ingredients, inventory, costing, resources, reports | owner, admin, manager |
| staff, audit, settings | owner, admin |

The POS sidebar hides unavailable routes and the POS layout redirects unauthorized direct route access.
