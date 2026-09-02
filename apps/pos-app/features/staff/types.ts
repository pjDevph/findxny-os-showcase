import { useTheme } from "../theme/ThemeContext";

export type WorkspaceRole = "owner" | "admin" | "manager" | "cashier" | "kitchen";
export type StatusTab = "active" | "suspended" | "archived";

export interface StaffListRow {
  user_id: string;
  role: WorkspaceRole;
  branch_id: string | null;
  created_at: string;
  is_archived?: boolean;
  is_suspended?: boolean;
  profiles?: { username?: string | null; full_name?: string | null } | null;
}

export interface StaffMember {
  user_id: string;
  username: string;
  full_name: string;
  role: WorkspaceRole;
  branch_id: string | null;
  created_at: string;
  is_archived: boolean;
  is_suspended: boolean;
}

export const MANAGEABLE_ROLES: WorkspaceRole[] = ["admin", "manager", "cashier", "kitchen"];

export const ROLE_DESC: Record<WorkspaceRole, string> = {
  owner: "Full workspace control — billing, settings, all operations.",
  admin: "Full operations — catalog, staff, reports, settings, orders.",
  manager: "Branch control — orders, bookings, catalog, reports. No billing.",
  cashier: "Sales & bookings — orders, payments, receipts, shift cash.",
  kitchen: "Kitchen only — dashboard and kitchen ticket screen.",
};

export const PERM_SECTIONS: { label: string; keys: string[] }[] = [
  { label: "Overview", keys: ["dashboard", "costing", "reports"] },
  { label: "Sales", keys: ["order", "counter", "transactions", "receipts", "shift"] },
  { label: "Bookings", keys: ["book-room", "book-amenity", "resources"] },
  { label: "Catalog", keys: ["products", "inventory"] },
  { label: "People", keys: ["staff"] },
  { label: "System", keys: ["kitchen", "printers", "audit", "settings", "access"] },
];

export const TAB_LABELS: Record<string, string> = {
  dashboard: "Dashboard", costing: "Costing",
  reports: "Reports", order: "Orders",
  counter: "Counter", transactions: "Transactions",
  receipts: "Receipts", shift: "Shift & Cash",
  "book-room": "Room Bookings", "book-amenity": "Amenity Bookings",
  resources: "Resources", products: "Products",
  inventory: "Inventory",
  staff: "Staff", kitchen: "Kitchen",
  printers: "Printers", audit: "Audit Log",
  settings: "Settings", access: "Access Matrix",
};

export const TOTAL_TABS = Object.keys(TAB_LABELS).length;

export function roleColor(C: ReturnType<typeof useTheme>["C"], role: WorkspaceRole): string {
  const ROLE_COLOR: Record<WorkspaceRole, string> = {
    owner: C.amber, admin: C.rust, manager: C.info, cashier: C.good, kitchen: C.warn,
  };
  return ROLE_COLOR[role] ?? C.ink3;
}
