// Single source of truth for "where does a signed-in user belong?"
// Used by /login, /auth/callback, the admin layout, and middleware.
//
// Cashiers don't have a dedicated POS terminal route yet — /orders is the
// closest match (they can create + view orders). Switch to /pos when that
// page lands.

export type WorkspaceRole = "owner" | "admin" | "manager" | "cashier" | "kitchen";

export const ADMIN_ROLES: ReadonlySet<WorkspaceRole> = new Set(["owner", "admin", "manager"]);

/** Where this role should land after sign-in / set-password. */
export function landingPath(role: WorkspaceRole | null | undefined): string {
  if (!role) return "/";
  if (role === "kitchen")  return "/kitchen";
  if (role === "cashier")  return "/orders";
  return "/dashboard"; // owner / admin / manager
}

/** Routes that *only* owner/admin/manager may access. */
export const ADMIN_ONLY_PATHS = [
  "/dashboard", "/branches", "/products", "/inventory", "/ingredients",
  "/transactions", "/reports", "/z-reports", "/audit-logs", "/settings",
  "/employees", "/resources", "/costing", "/menu-book", "/home-editor",
  "/expenses", "/customers", "/refunds", "/suppliers", "/tasks", "/vouchers",
] as const;

/** Routes a role is allowed to enter. Returned `false` triggers a redirect. */
export function canAccessPath(role: WorkspaceRole, path: string): boolean {
  // Admin-only routes
  if (ADMIN_ONLY_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return ADMIN_ROLES.has(role);
  }
  // Kitchen page: kitchen + admin trio
  if (path === "/kitchen" || path.startsWith("/kitchen/")) {
    return role === "kitchen" || ADMIN_ROLES.has(role);
  }
  // Orders page: cashier + admin trio (kitchen sees from /kitchen instead)
  if (path === "/orders" || path.startsWith("/orders/")) {
    return role === "cashier" || ADMIN_ROLES.has(role);
  }
  // Bookings: admin trio only
  if (path === "/bookings" || path.startsWith("/bookings/")) {
    return ADMIN_ROLES.has(role);
  }
  return true;
}
