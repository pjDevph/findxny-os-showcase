export type WorkspaceRole = "owner" | "admin" | "manager" | "cashier" | "kitchen";

export const POS_ROUTE_PERMISSIONS: Record<string, WorkspaceRole[]> = {
  // Accessible by all logged-in staff
  dashboard:      ["owner", "admin", "manager", "cashier", "kitchen"],

  // Cashier-level: operational screens
  order:          ["owner", "admin", "manager", "cashier"],
  counter:        ["owner", "admin", "manager", "cashier"],
  transactions:   ["owner", "admin", "manager", "cashier"],
  receipts:       ["owner", "admin", "manager", "cashier"],
  shift:          ["owner", "admin", "manager", "cashier"],
  "book-room":    ["owner", "admin", "manager", "cashier"],
  "book-amenity": ["owner", "admin", "manager", "cashier"],

  // Kitchen + counter staff: cashiers need to see prep status too
  kitchen:        ["owner", "admin", "manager", "cashier", "kitchen"],

  // Manager+ : catalog and reporting
  vouchers:       ["owner", "admin", "manager"],
  resources:      ["owner", "admin", "manager"],
  products:       ["owner", "admin", "manager"],
  inventory:      ["owner", "admin", "manager"],
  costing:        ["owner", "admin", "manager"],
  reports:        ["owner", "admin", "manager"],
  suppliers:      ["owner", "admin", "manager"],
  customers:      ["owner", "admin", "manager"],
  tasks:          ["owner", "admin", "manager"],
  expenses:       ["owner", "admin", "manager"],
  "z-reports":    ["owner", "admin", "manager"],

  // Admin+ : people and system. Staff/Audit/Settings also grant manager, matching
  // web's ADMIN_ONLY_PATHS (apps/web/lib/auth-routing.ts) which already lets manager
  // reach /employees, /audit-logs, and /settings — Printers and Access have no web
  // equivalent to align to, so they stay owner/admin-only.
  staff:          ["owner", "admin", "manager"],
  printers:       ["owner", "admin"],
  audit:          ["owner", "admin", "manager"],
  settings:       ["owner", "admin", "manager"],
  access:         ["owner", "admin"],
};

export function canAccessPosRoute(role: string | null | undefined, segment: string | undefined): boolean {
  if (!segment) return true;
  const allowed = POS_ROUTE_PERMISSIONS[segment];
  if (!allowed) return true;
  return !!role && allowed.includes(role as WorkspaceRole);
}
