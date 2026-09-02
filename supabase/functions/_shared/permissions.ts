import type { WorkspaceRole } from "./auth.ts";

export const Roles = {
  STAFF_WRITE:   ["owner", "admin", "manager", "cashier"]            as WorkspaceRole[],
  CATALOG_WRITE: ["owner", "admin", "manager"]                       as WorkspaceRole[],
  KITCHEN_WRITE: ["owner", "admin", "manager", "cashier", "kitchen"] as WorkspaceRole[],
  VOID_REFUND:   ["owner", "admin", "manager"]                       as WorkspaceRole[],
  ADMIN_ONLY:    ["owner", "admin"]                                  as WorkspaceRole[],
  OWNER_ONLY:    ["owner"]                                           as WorkspaceRole[],
};
