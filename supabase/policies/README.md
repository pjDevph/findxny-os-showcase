# RLS Policies

All policies live in [migrations/0002_rls.sql](../migrations/0002_rls.sql).

## Pattern
- Every workspace-scoped table has `enable row level security`.
- Reads: `is_workspace_member(workspace_id)` — any member of the workspace.
- Writes: gated to specific roles via `is_workspace_member(workspace_id, array[...])`.

## Role matrix
| Capability                    | owner | admin | manager | cashier | kitchen |
|-------------------------------|:-----:|:-----:|:-------:|:-------:|:-------:|
| Manage workspace settings     |  ✅   |       |         |         |         |
| Manage members                |  ✅   |  ✅   |         |         |         |
| Manage branches               |  ✅   |  ✅   |         |         |         |
| Manage catalog/inventory      |  ✅   |  ✅   |   ✅    |         |         |
| Take orders / bookings / pay  |  ✅   |  ✅   |   ✅    |   ✅    |         |
| Update kitchen tickets        |  ✅   |  ✅   |   ✅    |         |   ✅    |
| Void transaction / refund     |  ✅   |  ✅   |   ✅    |         |         |
| Read audit log                |  ✅   |  ✅   |         |         |         |

Mutations that need cross-table consistency (orders, bookings, payments, refunds, voids, kitchen status, inventory adjust) are routed through Edge Functions using the service role, which write the audit log atomically.
