import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";
import { canAccessPath, type WorkspaceRole } from "./lib/auth-routing";
import { ONLINE_ORDERING_ENABLED, ONLINE_BOOKING_ENABLED } from "./lib/env";

const STAFF_PATHS = [
  "/dashboard", "/branches", "/products", "/inventory", "/orders", "/bookings",
  "/kitchen", "/transactions", "/employees", "/reports", "/audit-logs", "/settings",
  "/resources", "/costing", "/menu-book", "/ingredients", "/home-editor",
];

const RANKED_ROLES: WorkspaceRole[] = ["owner", "admin", "manager", "kitchen", "cashier"];

// Transactional customer routes, gated on the commerce flags. Blocked here
// rather than inside each page so a direct URL or a bookmark is caught too —
// most of these pages are client components that would otherwise render and
// only fail at submit. Tracking routes (/booking-checker, /booking-tracking,
// /order-tracking) stay open: existing customers still need them.
const ORDER_PATHS = ["/food-cart", "/checkout", "/payment"];
const BOOKING_PATHS = ["/booking-cart", "/book", "/booking", "/booking-callback"];

// Exact segment match — "/booking" must not swallow "/booking-checker".
const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(p + "/"));

export async function middleware(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // ── Commerce kill switch (no customer payment gateway yet) ──────────────
  if (!ONLINE_ORDERING_ENABLED && matches(path, ORDER_PATHS)) {
    return NextResponse.redirect(new URL("/unavailable?f=order", request.url));
  }
  if (!ONLINE_BOOKING_ENABLED && matches(path, BOOKING_PATHS)) {
    return NextResponse.redirect(new URL("/unavailable?f=booking", request.url));
  }

  // ── Admin/staff route guard ─────────────────────────────────────────────
  const isStaffPath = STAFF_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (isStaffPath) {
    if (!user) return NextResponse.redirect(new URL(`/login?next=${path}`, request.url));

    // auth-context read — documented exception, see admin-api.ts
    const { data } = await supabase
      .from("workspace_members").select("role").eq("user_id", user.id).limit(20);
    const roles = new Set(((data ?? []) as Array<{ role: WorkspaceRole }>).map((m) => m.role));
    const role = RANKED_ROLES.find((r) => roles.has(r));
    if (!role) return NextResponse.redirect(new URL("/", request.url));
    if (!canAccessPath(role, path)) return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // ── Customer gated routes ───────────────────────────────────────────────
  if ((path === "/profile" || path.startsWith("/profile/")) && !user) {
    return NextResponse.redirect(new URL(`/login?next=${path}`, request.url));
  }

  // Maintenance mode is handled by conditional rendering in (customer)/layout.tsx
  // — it reads the workspace's maintenance_mode from the menu API and renders
  // MaintenancePage in place of the normal layout for non-staff visitors.

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
