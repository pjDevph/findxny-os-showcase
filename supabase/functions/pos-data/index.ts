// POST /pos-data — single read endpoint for every POS app screen.
// Replaces per-screen direct supabase.from(...).select() calls with a single
// authenticated, workspace-scoped endpoint. Auth + workspace membership is
// validated once; all DB queries use the service-role adminClient().
//
// Body shape: { workspace_id, resource: "...", params?: {...} }
// Each resource case returns the exact shape its POS screen expects.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { phStartOfDay, phEndOfDay } from "../_shared/dates.ts";
import { ilikePattern } from "../_shared/postgrest.ts";
import { PAGE_SIZES, REPORTS_CAPS } from "../_shared/pagination.ts";
import { deriveOrderStatusFromTicketStatuses } from "../_shared/kitchenTickets.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  resource: z.enum([
    // Dashboard
    "dashboard-gross-sales",
    "dashboard-net-sales",
    "dashboard-active-orders-count",
    "dashboard-kitchen-queue-count",
    "dashboard-low-stock",
    "dashboard-cancelled-today-count",
    "dashboard-live-orders",
    "dashboard-payment-breakdown",
    "dashboard-branch-info",
    "dashboard-pending-pay-count",
    "dashboard-bookings-snapshot",
    "dashboard-upcoming-bookings",
    // POS Home
    "home-today-sales",
    "home-active-orders-count",
    "home-kitchen-queue-count",
    "home-low-stock",
    "home-today-orders-count",
    "home-product-count",
    "home-staff-count",
    "home-pending-holds-count",
    // New Order
    "order-ticket-lookup",
    "order-ticket-items",
    "order-product-list",
    "order-category-counts",
    "order-workspace-config",
    "order-bookable-resources",
    // Products
    "products-list",
    "products-stats",
    "products-categories",
    "products-recipe-cogs",
    "products-ingredient-picker",
    "products-recipe-edit",
    // Reports
    "reports-orders-main",
    "reports-channel-breakdown",
    "reports-product-ranking",
    "reports-payment-breakdown",
    "reports-refund-total",
    "reports-order-detail",
    // Transactions
    "transactions-list",
    "transactions-export",
    "transactions-order-detail",
    // Kitchen
    "kitchen-live-tickets",
    "kitchen-history",
    // Inventory (unified catalog — raw materials + self-stocked products)
    "inventory-list",
    "inventory-untracked-products",
    // Audit Log
    "audit-actor-map",
    "audit-log-entries",
    // Settings
    "settings-workspace",
    "settings-branches",
    // Resources
    "resources-list",
    "resources-branches-picker",
    // Costing
    "costing-items",
    // Room Calendar
    "room-calendar-bookings",
    // Auth Context
    "auth-memberships",
    "auth-first-branch",
    // Printer Manager
    "printer-config",
    // Receipts Reprint
    "receipts-orders-list",
    "receipts-order-items",
    "receipts-order-bookings",
    // Vouchers
    "vouchers-list",
    "vouchers-redemptions",
    "vouchers-check",
    "vouchers-validate",
    // Staff
    "staff-list",
    // Customers
    "customers-list",
    // Z-Reports
    "zreports-list",
    // Printers screen
    "printers-load",
    // Bookings screens
    "booking-amenity-load",
    "booking-room-load",
    "booking-epayment-confirm",
  ]),
  params: z.record(z.unknown()).optional().default({}),
});

// kitchen role gets dashboard + kitchen screens only; all other screens need STAFF_WRITE
const STAFF_WRITE = Roles.STAFF_WRITE;   // owner/admin/manager/cashier
const KITCHEN_WRITE = Roles.KITCHEN_WRITE; // owner/admin/manager/kitchen

// Resources accessible by kitchen role
const KITCHEN_RESOURCES = new Set([
  "dashboard-gross-sales",
  "dashboard-net-sales",
  "dashboard-active-orders-count",
  "dashboard-kitchen-queue-count",
  "dashboard-low-stock",
  "dashboard-cancelled-today-count",
  "dashboard-live-orders",
  "dashboard-payment-breakdown",
  "dashboard-branch-info",
  "dashboard-pending-pay-count",
  "dashboard-bookings-snapshot",
  "dashboard-upcoming-bookings",
  "home-today-sales",
  "home-active-orders-count",
  "home-kitchen-queue-count",
  "home-low-stock",
  "home-today-orders-count",
  "home-product-count",
  "home-staff-count",
  "home-pending-holds-count",
  "kitchen-live-tickets",
  "kitchen-history",
]);

function clampLimit(v: unknown, def = 50, max = 1000): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}
function clampOffset(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// Mirrors buildOrderNotes() in apps/pos-app/app/pos/order.tsx, which packs
// "Guest: X | Ref: Y | Note: Z" into orders.notes at creation time — the
// only place a walk-in's typed name or internal note ever gets persisted.
function parseOrderNotes(raw: string | null): { guestName: string | null; internalNote: string | null; refNumber: string | null } {
  if (!raw) return { guestName: null, internalNote: null, refNumber: null };
  let guestName: string | null = null;
  let internalNote: string | null = null;
  // payments-cash-confirm appends "· Ref: X" onto the same notes field (a
  // different separator than the " | " Guest/Note split below), so this is
  // matched independently rather than assumed to align with that split.
  const refMatch = raw.match(/Ref:\s*([^\s·|]+)/);
  const refNumber = refMatch ? refMatch[1] : null;
  for (const part of raw.split(" | ")) {
    if (part.startsWith("Guest: ")) guestName = part.slice(7);
    else if (part.startsWith("Note: ")) internalNote = part.slice(6).replace(/\s*·\s*Ref:.*/, "").trim() || null;
  }
  return { guestName, internalNote, refNumber };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT_RE = /^[a-z0-9_]{1,60}$/i;
// Order/ticket numbers (e.g. "ORD-000001") need a hyphen on top of IDENT_RE's
// charset, but must still exclude PostgREST filter-DSL metacharacters
// (`,`.()) since this value is interpolated into a raw .or() string below.
const ORDER_REF_RE = /^[a-z0-9_-]{1,60}$/i;
function asOrderRef(v: unknown): string | undefined {
  return typeof v === "string" && ORDER_REF_RE.test(v) ? v : undefined;
}
function asUuid(v: unknown): string | undefined {
  return typeof v === "string" && UUID_RE.test(v) ? v : undefined;
}
function asIdent(v: unknown): string | undefined {
  return typeof v === "string" && IDENT_RE.test(v) ? v : undefined;
}
function asIso(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}
// Start-of-day fallback for date-bounded dashboard queries when the caller
// omits a period_start — Asia/Manila midnight (matches every other surface:
// Reports, shift/Z-reports, and the client's own now-corrected "today"),
// not server-local/UTC midnight, which was 8 hours off from PH midnight.
function todayStartIso(): string {
  const nowPh = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return phStartOfDay(nowPh.toISOString().slice(0, 10)).toISOString();
}

// ─── STOCK STATUS HELPER ──────────────────────────────────────────────────────

type StockRow = { quantity: number; low_stock_threshold: number | null };

function computeStockStatus(rows: StockRow[] | null | undefined): {
  stock_status: "not_tracked" | "out_of_stock" | "low_stock" | "in_stock";
  available_quantity: number | null;
} {
  if (!rows || rows.length === 0) {
    return { stock_status: "not_tracked", available_quantity: null };
  }
  // Sum across all inventory_items rows for this product (multi-branch support)
  const available = rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0);
  const threshold = rows.reduce((max, r) => Math.max(max, r.low_stock_threshold ?? 0), 0);
  if (available <= 0) return { stock_status: "out_of_stock", available_quantity: available };
  if (threshold > 0 && available <= threshold) return { stock_status: "low_stock", available_quantity: available };
  return { stock_status: "in_stock", available_quantity: available };
}

// Products that track their own stock directly (the "consumes 1x itself"
// case) have exactly one inventory_catalog row keyed by product_id — this
// maps a batch of product ids to their per-branch stock rows via that
// indirection. Multi-ingredient recipe-only products (no catalog row of
// their own) report "not_tracked" here, same as before this unification —
// showing one badge for a product that depends on several different
// ingredients' stock levels is ambiguous, so this stays scoped to direct
// self-stock only, matching today's existing behavior exactly.
async function fetchStockRowsByProduct(
  admin: ReturnType<typeof adminClient>,
  productIds: string[],
): Promise<Map<string, StockRow[]>> {
  const map = new Map<string, StockRow[]>();
  if (productIds.length === 0) return map;
  const { data: catalogRows } = await admin
    .from("inventory_catalog").select("id, product_id").in("product_id", productIds);
  const catalogIdByProduct = new Map((catalogRows ?? []).map((c: any) => [c.product_id, c.id as string]));
  const catalogIds = [...catalogIdByProduct.values()];
  if (catalogIds.length === 0) return map;

  const { data: stockRows } = await admin
    .from("inventory_items").select("catalog_id, quantity, low_stock_threshold").in("catalog_id", catalogIds);
  const rowsByCatalog = new Map<string, StockRow[]>();
  for (const r of stockRows ?? []) {
    if (!rowsByCatalog.has(r.catalog_id)) rowsByCatalog.set(r.catalog_id, []);
    rowsByCatalog.get(r.catalog_id)!.push({ quantity: Number(r.quantity), low_stock_threshold: r.low_stock_threshold });
  }
  for (const [productId, catalogId] of catalogIdByProduct) {
    map.set(productId, rowsByCatalog.get(catalogId) ?? []);
  }
  return map;
}

// ─── DASHBOARD HANDLERS ───────────────────────────────────────────────────────

async function dashboardGrossSales(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  const periodStart = asIso(p.period_start) ?? todayStartIso();
  const branchId = asUuid(p.branch_id);
  let q = admin.from("orders").select("total,source")
    .eq("workspace_id", wsId)
    .neq("status", "cancelled")
    .neq("payment_status", "refunded")
    .gte("created_at", periodStart);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data } = await q;
  return json({ "dashboard-gross-sales": data ?? [] });
}

async function dashboardNetSales(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  // Sums orders.total directly where status='completed' — matches every
  // other POS-app surface (Reports & Analytics, shift/Z-reports), so Net
  // Sales means the same thing everywhere inside this app. This used to sum
  // the transactions ledger instead, deliberately matching web admin's
  // dashboard — that POS<->Web parity is a known, accepted trade-off now;
  // an order completed via a path that writes no transactions row (see
  // orders-advance) would previously have been invisible here even though
  // Reports/shift-reports already counted it.
  const periodStart = asIso(p.period_start) ?? todayStartIso();
  const branchId = asUuid(p.branch_id);
  let q = admin.from("orders").select("total")
    .eq("workspace_id", wsId)
    .eq("status", "completed")
    .neq("payment_status", "refunded")
    .gte("created_at", periodStart);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data } = await q;
  return json({ "dashboard-net-sales": data ?? [] });
}

async function dashboardPaymentBreakdown(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  // Per-payment-leg amounts from the transactions ledger — the SAME source as
  // reports-payment-breakdown, so the Dashboard split matches Reports exactly.
  // The old payment_intents!inner(orders) join attributed the FULL order total
  // to EVERY leg, so a split order (e.g. Cash ₱82 + QR Ph ₱800) counted ₱882
  // under each method — double-counting the order and inflating every total.
  const periodStart = asIso(p.period_start);
  const branchId = asUuid(p.branch_id);
  let q = admin.from("transactions")
    .select("amount,payment_method")
    .eq("workspace_id", wsId)
    .eq("type", "sale")
    .eq("status", "completed")
    .limit(2000);
  if (periodStart) q = q.gte("created_at", periodStart);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data } = await q;
  return json({ "dashboard-payment-breakdown": data ?? [] });
}

async function dashboardBranchInfo(
  admin: ReturnType<typeof adminClient>,
  p: Record<string, any>,
): Promise<Response> {
  const branchId = asUuid(p.branch_id);
  if (!branchId) throw BadRequest("params.branch_id (uuid) required");
  const { data } = await admin.from("branches")
    .select("name,accepting_orders,accepting_bookings")
    .eq("id", branchId)
    .maybeSingle();
  return json({ "dashboard-branch-info": data });
}

interface LiveOrderRow {
  id: string; order_no: string; order_type: string | null; table_no: string | null;
  total: number; status: string; source: string | null; created_at: string;
  customers: { name: string } | null;
}

/**
 * Today's orders, UNION any order that still has an open kitchen ticket
 * (same set dashboard-kitchen-queue-count draws from) regardless of when it
 * was created — previously today-only-by-created_at, which let an order
 * stuck open from a prior day vanish from this list/the Active tab while
 * still being counted by the Kitchen Queue KPI, with nothing on screen
 * explaining the "48 vs queue is clear" contradiction.
 *
 * For any order that has an open ticket, the STATUS SHOWN HERE is derived
 * from that order's actual kitchen tickets, not the stored orders.status —
 * the two can drift (e.g. a payment confirmation that completed the order
 * before the kitchen finished it; see payments-cash-confirm's history) — so
 * this view stays honest about what Prep Display is actually showing even
 * if the order's own status column is stale.
 */
async function fetchLiveOrders(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  branchId: string | undefined,
  tStart: string,
  limit: number,
): Promise<LiveOrderRow[]> {
  let ticketQ = admin.from("kitchen_tickets").select("order_id, kitchen_status")
    .eq("workspace_id", wsId)
    .not("kitchen_status", "in", "(served,completed)");
  if (branchId) ticketQ = ticketQ.eq("branch_id", branchId);
  const { data: openTicketRows } = await ticketQ;
  const openOrderIds = [...new Set((openTicketRows ?? []).map((t: any) => t.order_id as string))];

  let q = admin.from("orders")
    .select("id,order_no,order_type,table_no,total,status,source,created_at,customers(name)")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .limit(limit);
  q = openOrderIds.length > 0
    ? q.or(`created_at.gte.${tStart},id.in.(${openOrderIds.join(",")})`)
    : q.gte("created_at", tStart);
  if (branchId) q = q.eq("branch_id", branchId);
  const { data: orders } = await q;

  const openSet = new Set(openOrderIds);
  const idsNeedingRollup = (orders ?? []).filter((o: any) => openSet.has(o.id)).map((o: any) => o.id as string);
  const derivedStatusByOrder = new Map<string, string>();
  if (idsNeedingRollup.length > 0) {
    const { data: allTix } = await admin.from("kitchen_tickets")
      .select("order_id, kitchen_status").in("order_id", idsNeedingRollup);
    const statusesByOrder = new Map<string, string[]>();
    for (const t of (allTix ?? []) as any[]) {
      const arr = statusesByOrder.get(t.order_id) ?? [];
      arr.push(t.kitchen_status ?? "new");
      statusesByOrder.set(t.order_id, arr);
    }
    for (const [orderId, statuses] of statusesByOrder) {
      derivedStatusByOrder.set(orderId, deriveOrderStatusFromTicketStatuses(statuses));
    }
  }

  return ((orders ?? []) as any[]).map((o) => ({
    ...o,
    status: derivedStatusByOrder.get(o.id) ?? o.status,
  })) as LiveOrderRow[];
}

async function handleDashboard(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "dashboard-gross-sales":
      return dashboardGrossSales(admin, wsId, p);
    case "dashboard-net-sales":
      return dashboardNetSales(admin, wsId, p);
    case "dashboard-active-orders-count": {
      const branchId = asUuid(p.branch_id);
      let q = admin.from("orders").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .in("status", ["pending", "preparing", "ready"]);
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return json({ "dashboard-active-orders-count": count ?? 0 });
    }
    case "dashboard-kitchen-queue-count": {
      const branchId = asUuid(p.branch_id);
      let q = admin.from("kitchen_tickets").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .not("kitchen_status", "in", "(served,completed)");
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return json({ "dashboard-kitchen-queue-count": count ?? 0 });
    }
    case "dashboard-low-stock": {
      // NOTE: quantity <= low_stock_threshold can't be expressed as a supabase-js
      // fluent filter (it compares two columns on the same row, not a column to a
      // literal), so we fetch all rows with a threshold set and filter client-side
      // (see apps/pos-app/app/pos/dashboard.tsx). Real server-side filtering would
      // need a generated column, view, or RPC — follow-up, not done here.
      const { data } = await admin.from("inventory_items")
        .select("quantity,low_stock_threshold")
        .eq("workspace_id", wsId)
        .gt("low_stock_threshold", 0)
        .limit(200);
      return json({ "dashboard-low-stock": data ?? [] });
    }
    case "dashboard-cancelled-today-count": {
      const tStart = asIso(p.today_start); if (!tStart) throw BadRequest("params.today_start required");
      const branchId = asUuid(p.branch_id);
      let q = admin.from("orders").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("status", "cancelled")
        .gte("created_at", tStart);
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return json({ "dashboard-cancelled-today-count": count ?? 0 });
    }
    case "dashboard-live-orders": {
      const tStart = asIso(p.today_start); if (!tStart) throw BadRequest("params.today_start required");
      const branchId = asUuid(p.branch_id);
      const orders = await fetchLiveOrders(admin, wsId, branchId, tStart, 100);
      return json({ "dashboard-live-orders": orders });
    }
    // Real per-status counts, using a much higher cap than the visible
    // table's 100-row limit — this used to call the same capped fetch as
    // dashboard-live-orders while claiming independence from its cap, which
    // wasn't actually true (both went through the same capped query), so the
    // tab badges/"{N} records" header could still silently undercount on a
    // branch/day with more than the visible-list's cap worth of orders.
    case "dashboard-live-orders-counts": {
      const tStart = asIso(p.today_start); if (!tStart) throw BadRequest("params.today_start required");
      const branchId = asUuid(p.branch_id);
      const orders = await fetchLiveOrders(admin, wsId, branchId, tStart, REPORTS_CAPS.ordersMain);
      const counts: Record<string, number> = {};
      for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
      return json({ "dashboard-live-orders-counts": counts });
    }
    case "dashboard-payment-breakdown":
      return dashboardPaymentBreakdown(admin, wsId, p);
    case "dashboard-branch-info":
      return dashboardBranchInfo(admin, p);
    case "dashboard-pending-pay-count": {
      // Pay-at-counter orders awaiting cashier settlement carry
      // orders.payment_status='pending_counter' (set by public-orders-create,
      // cleared by pos-counter-pay) — nothing ever writes a payment_intents
      // row with provider='unpaid', so the previous query always returned 0
      // even with real orders waiting to be paid.
      const tStart = asIso(p.today_start); if (!tStart) throw BadRequest("params.today_start required");
      const branchId = asUuid(p.branch_id);
      let q = admin.from("orders").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("payment_status", "pending_counter")
        .gte("created_at", tStart);
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return json({ "dashboard-pending-pay-count": count ?? 0 });
    }
    case "dashboard-bookings-snapshot": {
      const tStart = asIso(p.today_start); if (!tStart) throw BadRequest("params.today_start required");
      const tEnd   = asIso(p.today_end);   if (!tEnd)   throw BadRequest("params.today_end required");
      const { data } = await admin.from("bookings")
        .select("id,status,total")
        .eq("workspace_id", wsId)
        .gte("start_time", tStart)
        .lte("start_time", tEnd);
      const rows = data ?? [];
      const activeRows = rows.filter((r: any) => r.status !== "cancelled" && r.status !== "expired");
      return json({ "dashboard-bookings-snapshot": {
        total:       activeRows.length,
        confirmed:   rows.filter((r: any) => r.status === "confirmed").length,
        checked_in:  rows.filter((r: any) => r.status === "checked_in").length,
        checked_out: rows.filter((r: any) => r.status === "checked_out").length,
        pending:     rows.filter((r: any) => r.status === "pending" || r.status === "hold").length,
        cancelled:   rows.filter((r: any) => r.status === "cancelled").length,
        revenue:     activeRows.reduce((sum: number, r: any) => sum + Number(r.total ?? 0), 0),
      }});
    }
    case "dashboard-upcoming-bookings": {
      const tStart = asIso(p.today_start); if (!tStart) throw BadRequest("params.today_start required");
      const tEnd   = asIso(p.today_end);   if (!tEnd)   throw BadRequest("params.today_end required");
      const { data } = await admin.from("bookings")
        .select("id,start_time,status,guest_name,customers(name),bookable_resources(name)")
        .eq("workspace_id", wsId)
        .gte("start_time", tStart)
        .lte("start_time", tEnd)
        .not("status", "in", "(cancelled,expired,checked_out)")
        .order("start_time", { ascending: true })
        .limit(8);
      return json({ "dashboard-upcoming-bookings": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── POS HOME HANDLERS ────────────────────────────────────────────────────────

async function handleHome(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "home-today-sales": {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { data } = await admin.from("orders").select("total")
        .eq("workspace_id", wsId)
        .eq("status", "completed")
        .gte("created_at", todayStart.toISOString());
      return json({ "home-today-sales": data ?? [] });
    }
    case "home-active-orders-count": {
      const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .in("status", ["pending", "preparing"]);
      return json({ "home-active-orders-count": count ?? 0 });
    }
    case "home-kitchen-queue-count": {
      const { count } = await admin.from("kitchen_tickets").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .not("kitchen_status", "in", "(served,completed)");
      return json({ "home-kitchen-queue-count": count ?? 0 });
    }
    case "home-low-stock": {
      // NOTE: quantity <= low_stock_threshold can't be expressed as a supabase-js
      // fluent filter (it compares two columns on the same row, not a column to a
      // literal), so we fetch all rows with a threshold set and filter client-side
      // (see apps/pos-app/app/pos/index.tsx). Real server-side filtering would
      // need a generated column, view, or RPC — follow-up, not done here.
      const { data } = await admin.from("inventory_items")
        .select("quantity,low_stock_threshold")
        .eq("workspace_id", wsId)
        .gt("low_stock_threshold", 0)
        .limit(200);
      return json({ "home-low-stock": data ?? [] });
    }
    case "home-today-orders-count": {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .gte("created_at", todayStart.toISOString());
      return json({ "home-today-orders-count": count ?? 0 });
    }
    case "home-product-count": {
      const { count } = await admin.from("products").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("active", true);
      return json({ "home-product-count": count ?? 0 });
    }
    case "home-staff-count": {
      const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true })
        .eq("workspace_id", wsId);
      return json({ "home-staff-count": count ?? 0 });
    }
    case "home-pending-holds-count": {
      const { count } = await admin.from("bookings").select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("status", "hold")
        .gt("hold_expires_at", new Date().toISOString());
      return json({ "home-pending-holds-count": count ?? 0 });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── NEW ORDER HANDLERS ───────────────────────────────────────────────────────

async function handleOrder(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "order-ticket-lookup": {
      // asOrderRef enforces a safe charset before this value is interpolated
      // into a PostgREST .or() filter string below — a non-conforming q must
      // be rejected outright, not silently accepted raw.
      const q = asOrderRef(p.q);
      if (!q) throw BadRequest("params.q required");
      const { data } = await admin.from("orders")
        .select("id,order_no,ticket_no,table_no")
        .eq("workspace_id", wsId)
        .or(`order_no.eq.${q},ticket_no.eq.${q}`)
        .maybeSingle();
      return json({ "order-ticket-lookup": data });
    }
    case "order-ticket-items": {
      const orderId = asUuid(p.order_id);
      if (!orderId) throw BadRequest("params.order_id (uuid) required");
      const { data } = await admin.from("order_items")
        .select("quantity,unit_price,notes,products(id,name)")
        .eq("order_id", orderId);
      return json({ "order-ticket-items": data ?? [] });
    }
    case "order-product-list": {
      const PAGE_SIZE = PAGE_SIZES.orderProductList;
      const from = clampOffset(p.from);
      const to = from + PAGE_SIZE - 1;
      // Inactive-but-not-archived products are included (not filtered to
      // active=true) so a cashier's quick "mark unavailable" long-press
      // (products-toggle active:false) still shows the tile — greyed out,
      // add-to-cart blocked — instead of it vanishing from the grid entirely
      // with no way back in. Archived (deleted) products are excluded.
      const { data, error } = await admin.from("products")
        .select("id,name,sku,price,image_url,is_pinned,prep_station,active,description,product_categories(name),product_addon_groups(id,product_id,name,is_required,min_select,max_select,sort_order,product_addons(id,group_id,name,price,sort_order,is_active))")
        .eq("workspace_id", wsId)
        .eq("archived", false)
        .gt("price", 0)
        .order("name", { ascending: true })
        .range(from, to);
      // This used to discard `error` and fall through to `data ?? []` — a
      // query failure (e.g. a stale schema missing a joined column/table on
      // a given project) silently rendered as "No products found" instead of
      // a diagnosable error, indistinguishable from a genuinely empty catalog.
      if (error) throw BadRequest(error.message);
      const products = data ?? [];
      products.sort((a: any, b: any) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return 0;
      });

      const stockByProduct = await fetchStockRowsByProduct(admin, products.map((p: any) => p.id));
      const mapped = products.map((row: any) => {
        const { product_addon_groups, ...rest } = row;
        return {
          ...rest,
          ...computeStockStatus(stockByProduct.get(row.id)),
          addon_groups: (product_addon_groups ?? [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((g: any) => ({
              id: g.id, product_id: g.product_id, name: g.name,
              is_required: g.is_required, min_select: g.min_select, max_select: g.max_select,
              sort_order: g.sort_order,
              addons: (g.product_addons ?? [])
                .filter((a: any) => a.is_active !== false)
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                .map((a: any) => ({ id: a.id, name: a.name, price: a.price, sort_order: a.sort_order })),
            })),
        };
      });
      return json({ "order-product-list": mapped });
    }
    // Category chip counts for the New Order grid — scoped to the exact same
    // orderable-only filter as order-product-list, and independent of that
    // resource's pagination so a category's count (and the chip itself,
    // client-side) doesn't wait on scrolling through every earlier page.
    case "order-category-counts": {
      const { data, error } = await admin.from("products")
        .select("product_categories(name)")
        .eq("workspace_id", wsId)
        .eq("archived", false)
        .gt("price", 0);
      if (error) throw BadRequest(error.message);
      const rows = data ?? [];
      const byCategory: Record<string, number> = {};
      for (const r of rows as any[]) {
        const name = r.product_categories?.name ?? "Other";
        byCategory[name] = (byCategory[name] ?? 0) + 1;
      }
      return json({ "order-category-counts": { total: rows.length, by_category: byCategory } });
    }
    case "order-workspace-config": {
      const { data } = await admin.from("workspaces")
        .select("name,tax_rate,service_rate,receipt_address,receipt_tin,receipt_footer,payment_config")
        .eq("id", wsId)
        .single();
      return json({ "order-workspace-config": data });
    }
    case "order-bookable-resources": {
      const { data } = await admin.from("bookable_resources")
        .select("id,name,type,capacity,hourly_rate,nightly_rate,branch_id")
        .eq("workspace_id", wsId)
        .eq("active", true)
        .order("name", { ascending: true });
      return json({ "order-bookable-resources": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── PRODUCTS HANDLERS ────────────────────────────────────────────────────────

async function handleProducts(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "products-list": {
      const PAGE_SIZE = PAGE_SIZES.productsList;
      const from = clampOffset(p.from);
      const to = from + PAGE_SIZE - 1;
      const wantArchived = p.archived === true;
      const { data, count } = await admin.from("products")
        .select("id,name,sku,barcode,price,kitchen_required,prep_station,active,for_sale,archived,is_pinned,featured,featured_blurb,image_url,category_id,track_inventory,product_categories(id,name),product_addon_groups(id,product_id,name,is_required,min_select,max_select,sort_order,product_addons(id,group_id,name,price,sort_order,is_active))", { count: "exact" })
        .eq("workspace_id", wsId)
        .eq("archived", wantArchived)
        .order("name", { ascending: true })
        .range(from, to);
      const products = data ?? [];

      const stockByProduct = await fetchStockRowsByProduct(admin, products.map((p: any) => p.id));
      const mapped = products.map((row: any) => {
        const { product_addon_groups, ...rest } = row;
        return {
          ...rest,
          ...computeStockStatus(stockByProduct.get(row.id)),
          addon_groups: (product_addon_groups ?? [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((g: any) => ({
              id: g.id, product_id: g.product_id, name: g.name,
              is_required: g.is_required, min_select: g.min_select, max_select: g.max_select,
              sort_order: g.sort_order,
              addons: (g.product_addons ?? [])
                .filter((a: any) => a.is_active !== false)
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                .map((a: any) => ({ id: a.id, name: a.name, price: a.price, sort_order: a.sort_order })),
            })),
        };
      });
      return json({ "products-list": mapped, total: count ?? mapped.length });
    }
    // Aggregate counts across the WHOLE catalog, independent of products-list's
    // pagination — a page-local tally would silently under-report once a
    // workspace has more products than one page (PAGE_SIZE above).
    case "products-stats": {
      const { data } = await admin.from("products")
        .select("id, active, for_sale, track_inventory, category_id")
        .eq("workspace_id", wsId)
        .eq("archived", false);
      const rows = data ?? [];
      const total = rows.length;
      const available = rows.filter((r: any) => r.active && r.for_sale).length;

      const { count: archivedCount } = await admin.from("products")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("archived", true);

      const trackedIds = rows.filter((r: any) => r.track_inventory).map((r: any) => r.id);
      const stockByProduct = await fetchStockRowsByProduct(admin, trackedIds);
      let lowOrOut = 0;
      for (const id of trackedIds) {
        const st = computeStockStatus(stockByProduct.get(id)).stock_status;
        if (st === "low_stock" || st === "out_of_stock") lowOrOut++;
      }

      const byCategory: Record<string, number> = {};
      for (const r of rows) {
        const key = r.category_id ?? "uncategorised";
        byCategory[key] = (byCategory[key] ?? 0) + 1;
      }

      return json({
        "products-stats": {
          total, available, unavailable: total - available, low_or_out_of_stock: lowOrOut,
          archived: archivedCount ?? 0,
          by_category: byCategory,
        },
      });
    }
    case "products-categories": {
      const { data } = await admin.from("product_categories")
        .select("id,name")
        .eq("workspace_id", wsId)
        .order("sort_order", { ascending: true });
      return json({ "products-categories": data ?? [] });
    }
    case "products-recipe-cogs": {
      const prodIds = Array.isArray(p.product_ids)
        ? (p.product_ids as unknown[]).filter((id) => asUuid(id)).slice(0, 200)
        : [];
      if (prodIds.length === 0) return json({ "products-recipe-cogs": [] });
      const { data } = await admin.from("recipe_items")
        .select("product_id,qty_used,inventory_catalog(id,name,unit,cost_per_unit)")
        .in("product_id", prodIds as string[]);
      return json({ "products-recipe-cogs": data ?? [] });
    }
    case "products-ingredient-picker": {
      // Sourced from the unified catalog — raw materials AND other products
      // that track their own stock (product_id set) are both valid recipe
      // components now (this is what lets a combo consume a canned soda
      // that's also sold standalone).
      const { data } = await admin.from("inventory_catalog")
        .select("id,name,unit,cost_per_unit,category,product_id")
        .eq("workspace_id", wsId)
        .eq("archived", false)
        .order("name", { ascending: true })
        .limit(500);
      return json({ "products-ingredient-picker": data ?? [] });
    }
    case "products-recipe-edit": {
      const productId = asUuid(p.product_id);
      if (!productId) throw BadRequest("params.product_id (uuid) required");
      const { data } = await admin.from("recipe_items")
        .select("id,qty_used,catalog_id,inventory_catalog(name,unit,cost_per_unit,product_id)")
        .eq("product_id", productId);
      return json({ "products-recipe-edit": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── REPORTS HANDLERS ─────────────────────────────────────────────────────────

async function reportsOrdersMain(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  const since = asIso(p.since);
  const until = asIso(p.until);
  // "Channel" here is really the order type (dine-in/takeout/delivery/…) —
  // orders has no "channel" column, that value lives on order_type.
  // payment_status is selected (not filtered here) so the client can exclude
  // a refunded order's total from revenue sums while still counting it in
  // orderCount/cancelledCount — see computeOrderMetrics in reportsHelpers.ts.
  let q = admin.from("orders")
    .select("id,total,status,payment_status,created_at,order_no,customer_id,table_no,notes")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .limit(REPORTS_CAPS.ordersMain);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);
  const channels = Array.isArray(p.channels)
    ? (p.channels as unknown[]).filter((c) => asIdent(c)) as string[]
    : [];
  if (channels.length) q = q.in("order_type", channels);
  const payMethods = Array.isArray(p.payment_methods)
    ? (p.payment_methods as unknown[]).filter((m) => asIdent(m)) as string[]
    : [];
  if (payMethods.length) {
    // orders has no payment_method column — filter by orders that have a
    // succeeded payment_intents row using one of the selected providers.
    const { data: matches } = await admin.from("payment_intents")
      .select("order_id")
      .eq("status", "succeeded")
      .in("provider", payMethods);
    const matchIds = [...new Set((matches ?? []).map((m: any) => m.order_id))];
    if (matchIds.length === 0) return json({ "reports-orders-main": [] });
    q = q.in("id", matchIds);
  }
  const { data } = await q;
  return json({ "reports-orders-main": data ?? [] });
}

async function reportsChannelBreakdown(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  const since = asIso(p.since);
  const until = asIso(p.until);
  let q = admin.from("orders")
    .select("status,payment_status,created_at,order_type,total")
    .eq("workspace_id", wsId)
    .limit(REPORTS_CAPS.channelBreakdown);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);
  const { data } = await q;
  return json({ "reports-channel-breakdown": data ?? [] });
}

async function reportsProductRanking(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  // products.category (flat text) is never written by the product editor
  // (it only sets category_id) so it's always null — every row fell into
  // the "other" bucket. product_categories(name), reached via category_id,
  // is the only source that's actually populated.
  // orders.payment_status excludes 'refunded' so a fully-refunded order's
  // items don't keep inflating Top Products/Category revenue after the sale
  // was reversed — mirrors dashboard-gross-sales' existing exclusion.
  const since = asIso(p.since);
  const until = asIso(p.until);
  let q = admin.from("order_items")
    .select("quantity,total,product_id,products(name,product_categories(name)),orders!inner(workspace_id,status,payment_status,created_at)")
    .eq("orders.workspace_id", wsId)
    .eq("orders.status", "completed")
    .neq("orders.payment_status", "refunded")
    .limit(REPORTS_CAPS.productRanking);
  if (since) q = q.gte("orders.created_at", since);
  if (until) q = q.lte("orders.created_at", until);
  const { data } = await q;
  return json({ "reports-product-ranking": data ?? [] });
}

async function reportsPaymentBreakdown(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  // Read from transactions (not payment_intents joined to orders) — it's the
  // only source that covers both order and booking sales with a real,
  // per-transaction payment_method, so nothing gets excluded or lumped into
  // "cash" the way the old payment_intents!inner(orders) join did.
  const since = asIso(p.since);
  const until = asIso(p.until);
  let q = admin.from("transactions")
    .select("amount,payment_method")
    .eq("workspace_id", wsId)
    .eq("type", "sale")
    .eq("status", "completed")
    .limit(REPORTS_CAPS.paymentBreakdown);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);
  const payMethods = Array.isArray(p.payment_methods)
    ? (p.payment_methods as unknown[]).filter((m) => asIdent(m)) as string[]
    : [];
  if (payMethods.length) q = q.in("payment_method", payMethods);
  const { data } = await q;
  return json({ "reports-payment-breakdown": data ?? [] });
}

async function reportsRefundTotal(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  const since = asIso(p.since);
  const until = asIso(p.until);
  let q = admin.from("transactions")
    .select("amount")
    .eq("workspace_id", wsId)
    .eq("type", "refund")
    .eq("status", "completed")
    .limit(REPORTS_CAPS.refundTotal);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);
  const { data } = await q;
  return json({ "reports-refund-total": data ?? [] });
}

async function handleReports(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "reports-orders-main":
      return reportsOrdersMain(admin, wsId, p);
    case "reports-channel-breakdown":
      return reportsChannelBreakdown(admin, wsId, p);
    case "reports-product-ranking":
      return reportsProductRanking(admin, wsId, p);
    case "reports-payment-breakdown":
      return reportsPaymentBreakdown(admin, wsId, p);
    case "reports-refund-total":
      return reportsRefundTotal(admin, wsId, p);
    case "reports-order-detail": {
      // tax_rate_pct/service_rate_pct/payment_method/ref_number/cash_amount/
      // change_amount are not columns on orders — see receipts-orders-list's
      // handler (handleReceipts, below) for the same fix and why (rates
      // derived from the order's own stored amounts, payment info from
      // payment_intents/notes).
      const orderId = asUuid(p.order_id);
      if (!orderId) throw BadRequest("params.order_id (uuid) required");
      const [{ data: items }, { data: order }, { data: intents }] = await Promise.all([
        admin.from("order_items")
          .select("id,quantity,unit_price,total,notes,products(name,sku,prep_station),order_item_addons(id,addon_id,name,price,qty)")
          .eq("order_id", orderId),
        admin.from("orders")
          .select("subtotal,tax,service_fee,discount,is_senior_pwd,discount_source,voucher_code,cashier_id,notes,order_type")
          .eq("id", orderId).maybeSingle(),
        admin.from("payment_intents")
          .select("provider, metadata, payments(amount)")
          .eq("order_id", orderId)
          .eq("status", "succeeded"),
      ]);
      const itemsWithAddons = (items ?? []).map((item: any) => {
        const { order_item_addons, ...rest } = item;
        return { ...rest, addons: order_item_addons ?? [] };
      });
      let pricing: Record<string, unknown> | null = null;
      if (order) {
        const parsed = parseOrderNotes((order as any).notes);
        const orderIntents = (intents ?? []) as any[];
        const cashIntent = orderIntents.find((i) => i.provider === "cash");
        const subtotalNum = Number((order as any).subtotal) || 0;
        const { notes: _notes, cashier_id: cashierId, ...orderRest } = order as any;
        // Per-leg amounts, not a joined provider string — see receipts-orders-
        // list's identical fix above for why a split-paid order needs this.
        const methods = orderIntents.map((i) => {
          const legPayments = Array.isArray(i.payments) ? i.payments : (i.payments ? [i.payments] : []);
          const amount = legPayments.reduce((s: number, pay: any) => s + Number(pay?.amount ?? 0), 0);
          return { method: i.provider as string, amount };
        });
        let cashierName: string | null = null;
        if (cashierId) {
          const { data: member } = await admin.from("workspace_members")
            .select("profiles(full_name,username)")
            .eq("user_id", cashierId)
            .eq("workspace_id", wsId)
            .maybeSingle();
          const profile = (member as any)?.profiles ?? null;
          cashierName = profile?.full_name ?? profile?.username ?? null;
        }
        pricing = {
          ...orderRest,
          cashier_name: cashierName,
          tax_rate_pct: subtotalNum > 0 ? (Number((order as any).tax) / subtotalNum) * 100 : 0,
          service_rate_pct: subtotalNum > 0 ? (Number((order as any).service_fee) / subtotalNum) * 100 : 0,
          payment_method: methods[0]?.method ?? null,
          payment_methods: methods,
          ref_number: parsed.refNumber,
          cash_amount: cashIntent?.metadata?.cash_received ?? null,
          change_amount: cashIntent?.metadata?.change ?? null,
        };
      }
      return json({ "reports-order-detail": itemsWithAddons, "reports-order-pricing": pricing });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── TRANSACTIONS HANDLERS ────────────────────────────────────────────────────

/**
 * Bulk-fetches settled payment methods for a set of orders in one query
 * (instead of N+1 per-row lookups). A split payment legitimately has more
 * than one succeeded payment_intents row per order — each is its own
 * {method, amount} leg, not collapsed into a single guessed value.
 */
async function fetchPaymentMethodsByOrderIds(
  admin: ReturnType<typeof adminClient>,
  orderIds: string[],
): Promise<Map<string, { method: string; amount: number }[]>> {
  const map = new Map<string, { method: string; amount: number }[]>();
  if (orderIds.length === 0) return map;
  const { data } = await admin.from("payment_intents")
    .select("order_id, provider, payments(amount)")
    .in("order_id", orderIds)
    .eq("status", "succeeded");
  for (const intent of (data ?? []) as any[]) {
    const orderId = intent.order_id as string;
    const provider = (intent.provider as string) ?? "other";
    const payments = Array.isArray(intent.payments) ? intent.payments : (intent.payments ? [intent.payments] : []);
    const amount = payments.reduce((s: number, pay: any) => s + Number(pay?.amount ?? 0), 0);
    const existing = map.get(orderId) ?? [];
    existing.push({ method: provider, amount });
    map.set(orderId, existing);
  }
  return map;
}

/**
 * Order IDs (in this workspace) that were settled with a given payment
 * provider. orders has no payment_method column — the method lives on the
 * succeeded payment_intents row — so the Order-History "Payment" filter
 * resolves the matching order IDs here and intersects them into the orders
 * query via .in("id", …). Returns a de-duped list (a split payment can have
 * more than one succeeded intent per order).
 */
async function fetchOrderIdsByPaymentMethod(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  provider: string,
  dateStart?: string,
): Promise<string[]> {
  let q = admin.from("payment_intents")
    .select("order_id")
    .eq("workspace_id", wsId)
    .eq("provider", provider)
    .eq("status", "succeeded")
    .not("order_id", "is", null);
  // Bound by the same period as the orders query so the returned id list stays
  // small (feeds .in("id", …)). A payment is settled at/after its order is
  // created, so any order with created_at >= dateStart has its intent >=
  // dateStart too — no in-range order is dropped by this bound.
  if (dateStart) q = q.gte("created_at", dateStart);
  const { data } = await q;
  const ids = new Set<string>();
  for (const r of (data ?? []) as any[]) if (r.order_id) ids.add(r.order_id as string);
  return [...ids];
}

async function handleTransactions(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "transactions-list": {
      const PAGE_SIZE = PAGE_SIZES.transactionsList;
      const from = clampOffset(p.from);
      const to = from + PAGE_SIZE - 1;
      let q = admin.from("orders")
        .select("id,order_no,total,subtotal,tax,service_fee,discount,is_senior_pwd,discount_source,voucher_code,status,payment_status,balance_due,source,created_at,order_type,table_no,notes,cancel_reason", { count: "estimated" })
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .range(from, to);
      const dateStart = asIso(p.start ?? p.date_start); if (dateStart) q = q.gte("created_at", dateStart);
      const statusFilter = asIdent(p.status); if (statusFilter) q = q.eq("status", statusFilter);
      const sourceFilter = asIdent(p.source); if (sourceFilter) q = q.eq("source", sourceFilter);
      const paymentFilter = asIdent(p.payment_method);
      let payOrderIds: string[] | null = null;
      if (paymentFilter) {
        payOrderIds = await fetchOrderIdsByPaymentMethod(admin, wsId, paymentFilter, dateStart);
        // No order in this workspace was settled with that method — return an
        // empty page (and zeroed stats) rather than an unfiltered list.
        if (payOrderIds.length === 0) {
          return json({
            "transactions-list": [], total: 0, from, to,
            revenue_total: 0, pending_count: 0, cancelled_count: 0,
          });
        }
        q = q.in("id", payOrderIds);
      }
      const { data, count } = await q;
      const rows = data ?? [];
      const methodsByOrder = await fetchPaymentMethodsByOrderIds(admin, rows.map((r: any) => r.id));
      const withMethods = rows.map((r: any) => ({ ...r, payment_methods: methodsByOrder.get(r.id) ?? [] }));

      // Revenue/Pending/Cancelled summary over the FULL filtered range, not
      // just this page — the client used to sum only whatever page(s)
      // happened to be loaded, silently wrong for any range wider than one
      // page. Capped at 5000 rows (a soft safety bound, not a real-world
      // workspace size) since this mirrors the codebase's existing
      // fetch-then-sum-in-JS convention (see dashboardGrossSales) rather
      // than a dedicated SQL aggregate.
      let statsQ = admin.from("orders").select("total,status")
        .eq("workspace_id", wsId)
        .limit(5000);
      if (dateStart) statsQ = statsQ.gte("created_at", dateStart);
      if (statusFilter) statsQ = statsQ.eq("status", statusFilter);
      if (sourceFilter) statsQ = statsQ.eq("source", sourceFilter);
      if (payOrderIds) statsQ = statsQ.in("id", payOrderIds);
      const { data: statsRows } = await statsQ;
      let revenueTotal = 0, pendingCount = 0, cancelledCount = 0;
      for (const r of (statsRows ?? []) as any[]) {
        if (r.status === "completed") revenueTotal += Number(r.total) || 0;
        else if (r.status === "pending") pendingCount++;
        else if (r.status === "cancelled") cancelledCount++;
      }

      return json({
        "transactions-list": withMethods, total: count ?? 0, from, to,
        revenue_total: revenueTotal, pending_count: pendingCount, cancelled_count: cancelledCount,
      });
    }
    case "transactions-export": {
      let q = admin.from("orders")
        .select("id,order_no,total,subtotal,tax,service_fee,status,source,created_at,order_type,table_no,notes")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .limit(1000);
      const dateStart = asIso(p.start ?? p.date_start); if (dateStart) q = q.gte("created_at", dateStart);
      const statusFilter = asIdent(p.status); if (statusFilter) q = q.eq("status", statusFilter);
      const sourceFilter = asIdent(p.source); if (sourceFilter) q = q.eq("source", sourceFilter);
      const paymentFilter = asIdent(p.payment_method);
      if (paymentFilter) {
        const payOrderIds = await fetchOrderIdsByPaymentMethod(admin, wsId, paymentFilter, dateStart);
        if (payOrderIds.length === 0) return json({ "transactions-export": [] });
        q = q.in("id", payOrderIds);
      }
      const { data } = await q;
      const rows = data ?? [];
      const methodsByOrder = await fetchPaymentMethodsByOrderIds(admin, rows.map((r: any) => r.id));
      const withMethods = rows.map((r: any) => ({ ...r, payment_methods: methodsByOrder.get(r.id) ?? [] }));
      return json({ "transactions-export": withMethods });
    }
    case "transactions-order-detail": {
      // Accepts either order_id directly (POS, which already has the row) or
      // order_no (web's Refunds page, which only has what the admin typed in).
      let orderId = asUuid(p.order_id);
      if (!orderId && typeof p.order_no === "string" && p.order_no.trim()) {
        const { data: byNo } = await admin.from("orders")
          .select("id")
          .eq("workspace_id", wsId)
          .eq("order_no", p.order_no.trim())
          .maybeSingle();
        orderId = (byNo as any)?.id ?? null;
      }
      if (!orderId) throw BadRequest("params.order_id (uuid) or params.order_no required");
      const [itemsRes, intentRes, orderRes] = await Promise.all([
        admin.from("order_items")
          .select("id,product_id,quantity,unit_price,total,notes,status,products(name,sku,prep_station),order_item_addons(id,addon_id,name,price,qty)")
          .eq("order_id", orderId),
        // A split payment or a partial-then-completed payment now legitimately
        // creates more than one succeeded payment_intents row per order — this
        // used to be .maybeSingle(), which throws on >1 row.
        admin.from("payment_intents")
          .select("id,status,provider,metadata,payments(id,amount)")
          .eq("order_id", orderId)
          .eq("status", "succeeded"),
        admin.from("orders")
          .select("cashier_id,order_no,status,payment_status,total,balance_due,branch_id,notes")
          .eq("id", orderId)
          .eq("workspace_id", wsId)
          .maybeSingle(),
      ]);
      const intents = (intentRes.data ?? []) as any[];
      const allPayments = intents.flatMap((i) => Array.isArray(i.payments) ? i.payments : (i.payments ? [i.payments] : []));
      const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
      const firstPayment = allPayments[0] ?? null;
      // Per-method breakdown (not a single guessed value) — a split payment
      // has one settled payment_intents row per leg, each with its own provider.
      const methodTotals: Record<string, number> = {};
      for (const intent of intents) {
        const legPayments = Array.isArray(intent.payments) ? intent.payments : (intent.payments ? [intent.payments] : []);
        const legAmount = legPayments.reduce((s: number, pay: any) => s + Number(pay?.amount ?? 0), 0);
        const provider = (intent.provider as string) ?? "other";
        methodTotals[provider] = (methodTotals[provider] ?? 0) + legAmount;
      }
      const paymentMethods = Object.entries(methodTotals).map(([method, amount]) => ({ method, amount }));
      // Cash Tendered/Change on a reprinted receipt only make sense for the
      // cash leg specifically — sourced from the metadata payments-cash-confirm
      // wrote at the time of sale, not guessed/defaulted.
      const cashIntent = intents.find((i) => i.provider === "cash");
      const cashReceived = cashIntent?.metadata?.cash_received ?? null;
      const cashChange = cashIntent?.metadata?.change ?? null;
      // ref_number (GCash/Maya/etc. reference) isn't its own column — it's
      // appended into orders.notes as "Ref: X" by payments-cash-confirm.
      const refNumber = parseOrderNotes((orderRes.data as any)?.notes ?? null).refNumber;
      const orderRow = orderRes.data as any;
      if (!orderRow) throw BadRequest("Order not found");

      // Resolve cashier name from cashier_id (second hop after the parallel fetch above)
      let cashierName: string | null = null;
      const cashierId = orderRow?.cashier_id ?? null;
      if (cashierId) {
        const memberRes = await admin.from("workspace_members")
          .select("profiles(full_name,username)")
          .eq("user_id", cashierId)
          .eq("workspace_id", wsId)
          .maybeSingle();
        const member = (memberRes.data as any)?.profiles ?? null;
        cashierName = member?.full_name ?? member?.username ?? null;
      }

      const orderItems = (itemsRes.data ?? []).map((item: any) => {
        const { order_item_addons, ...rest } = item;
        return { ...rest, addons: order_item_addons ?? [] };
      });

      return json({
        "transactions-order-detail": orderItems,
        "transactions-order-payment": firstPayment
          ? {
              payment_id: String(firstPayment.id), amount: totalPaid, methods: paymentMethods,
              cash_received: cashReceived, change: cashChange, ref_number: refNumber,
            }
          : null,
        "transactions-order-info": {
          order_id: orderId, order_no: orderRow.order_no, status: orderRow.status,
          payment_status: orderRow.payment_status, total: Number(orderRow.total),
          balance_due: orderRow.balance_due != null ? Number(orderRow.balance_due) : null,
          branch_id: orderRow.branch_id,
        },
        "cashier_name": cashierName,
      });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── KITCHEN HANDLERS ─────────────────────────────────────────────────────────

async function handleKitchen(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "kitchen-live-tickets": {
      // Items are fetched via kitchen_ticket_items (already scoped to this ticket's station
      // by orders-create) rather than all order_items filtered by prep_station client-side —
      // that filter broke for products with prep_station="none" + kitchen_required=true.
      const { data } = await admin.from("kitchen_tickets")
        .select("id,order_id,created_at,kitchen_status,status,station,orders(order_no,table_no,order_type,serve_location,source,customers(name)),kitchen_ticket_items(order_items(quantity,notes,products(name,sku)))")
        .eq("workspace_id", wsId)
        .not("kitchen_status", "in", "(served,completed)")
        .order("created_at", { ascending: true })
        .limit(100);
      return json({ "kitchen-live-tickets": data ?? [] });
    }
    case "kitchen-history": {
      const PAGE_SIZE = PAGE_SIZES.kitchenHistory;
      const from = clampOffset(p.from);
      const to = from + PAGE_SIZE - 1;
      const rangeStart = asIso(p.created_at_gte ?? p.history_range_start);
      let q = admin.from("kitchen_tickets")
        .select("id,order_id,created_at,kitchen_status,status,station,orders(order_no,table_no,order_type,serve_location,customers(name)),kitchen_ticket_items(order_items(quantity,notes,products(name,sku)))")
        .eq("workspace_id", wsId)
        .in("kitchen_status", ["served", "completed"])
        .order("created_at", { ascending: false })
        .range(from, to);
      if (rangeStart) q = q.gte("created_at", rangeStart);
      const { data } = await q;
      return json({ "kitchen-history": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── INVENTORY + INGREDIENTS HANDLERS ────────────────────────────────────────

async function handleInventoryAndIngredients(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "inventory-list": {
      // Unified catalog — raw materials and products that track their own
      // stock both live in inventory_catalog, each with a nested array of
      // per-branch stock rows. Replaces the old separate ingredients-list.
      const PAGE_SIZE = clampLimit(p.page_size, PAGE_SIZES.inventoryList, 200);
      const from = clampOffset(p.from);
      const to = from + PAGE_SIZE - 1;
      const includeArchived = p.include_archived === true || p.include_archived === "true";
      let q = admin.from("inventory_catalog")
        .select("id,name,category,unit,cost_per_unit,low_stock_threshold,archived,expiry_date,batch_number,product_id,products(name,for_sale,product_categories(name)),inventory_items(id,branch_id,quantity,low_stock_threshold)")
        .eq("workspace_id", wsId)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
        .range(from, to);
      if (!includeArchived) q = q.eq("archived", false);
      const categoryFilter = asIdent(p.category); if (categoryFilter) q = q.eq("category", categoryFilter);
      if (typeof p.search === "string" && p.search.trim()) {
        // match by product name OR item code (sku). ilikePattern strips ,().
        // so the value is safe to interpolate into the raw .or() string.
        const pat = ilikePattern(p.search.trim());
        q = q.or(`name.ilike.${pat},sku.ilike.${pat}`);
      }
      const branchId = asUuid(p.branch_id);
      const { data } = await q;
      const items = data ?? [];

      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const expiringSoon = items.filter((i: any) => i.expiry_date && i.expiry_date <= sevenDaysOut && i.expiry_date >= today).length;
      const expired = items.filter((i: any) => i.expiry_date && i.expiry_date < today).length;

      const mapped = items.map((row: any) => {
        const allRows = row.inventory_items ?? [];
        const stockRows = branchId ? allRows.filter((r: any) => r.branch_id === branchId) : allRows;
        const quantity = stockRows.reduce((s: number, r: any) => s + Number(r.quantity), 0);
        // Surface the specific branch's own inventory_items row — the POS
        // screen needs its id to drive Stock In/Out/Adjust against the exact
        // row. When branch_id was passed, resolve within that branch only.
        // When it wasn't (a caller that isn't branch-scoped, or a request
        // that raced ahead of branch resolution), fall back to the single
        // row if this business only stocks at one branch — genuinely
        // ambiguous only when there's more than one row to choose from.
        const branchRow = branchId
          ? stockRows[0] ?? null
          : allRows.length === 1 ? allRows[0] : null;
        const { inventory_items: _inventory_items, ...rest } = row;
        return {
          ...rest, quantity,
          inventory_item_id: branchRow?.id ?? null,
          branch_low_stock_threshold: branchRow?.low_stock_threshold ?? null,
        };
      });
      return json({ "inventory-list": mapped, expiring_soon: expiringSoon, expired });
    }
    case "inventory-untracked-products": {
      const { data } = await admin.from("products")
        .select("id,name,product_categories(name)")
        .eq("workspace_id", wsId)
        .eq("active", true)
        .order("name", { ascending: true })
        .limit(500);
      return json({ "inventory-untracked-products": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── AUDIT LOG HANDLERS ───────────────────────────────────────────────────────

async function handleAudit(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "audit-actor-map": {
      const { data } = await admin.from("workspace_members")
        .select("user_id,role,profiles(full_name,username)")
        .eq("workspace_id", wsId);
      return json({ "audit-actor-map": data ?? [] });
    }
    case "audit-log-entries": {
      const PAGE_SIZE = PAGE_SIZES.auditLogEntries;
      const page = Math.max(0, Math.floor(Number(p.page ?? 0)));
      const from = page * PAGE_SIZE;
      const to = (page + 1) * PAGE_SIZE - 1;
      let q = admin.from("audit_logs")
        .select("id,actor_id,action,entity_type,entity_id,before,after,created_at", { count: "estimated" })
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .range(from, to);
      const rangeStart = asIso(p.range_start); if (rangeStart) q = q.gte("created_at", rangeStart);
      // Accept entity_type (new) or entity_filter (old app builds) for backward compat.
      const entityKey = p.entity_type ?? p.entity_filter;
      if (typeof entityKey === "string" && entityKey.trim() && entityKey.trim() !== "all") {
        const ek = entityKey.trim();
        if (ek === "staff") {
          // Old logs used employee.*, new logs use staff.* — match both.
          q = q.or("action.ilike.staff.%,action.ilike.employee.%");
        } else {
          q = q.ilike("action", `${ek}.%`);
        }
      }
      if (typeof p.search === "string" && p.search.trim()) {
        q = q.ilike("action", `%${p.search.trim()}%`);
      }
      const { data, count } = await q;
      return json({ "audit-log-entries": data ?? [], total: count ?? 0, page, page_size: PAGE_SIZE });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── SETTINGS HANDLERS ────────────────────────────────────────────────────────

async function handleSettings(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
): Promise<Response> {
  switch (resource) {
    case "settings-workspace": {
      const { data } = await admin.from("workspaces")
        .select("id,name,phone,tax_rate,service_rate,hold_minutes,slot_minutes,receipt_address,receipt_tin,receipt_footer,receipt_wifi_ssid,receipt_wifi_cred,receipt_promo_line,receipt_logo,receipt_order_prefix,payment_config")
        .eq("id", wsId)
        .single();
      return json({ "settings-workspace": data });
    }
    case "settings-branches": {
      const { data } = await admin.from("branches")
        .select("id,name,accepting_orders,accepting_bookings")
        .eq("workspace_id", wsId)
        .order("name", { ascending: true });
      return json({ "settings-branches": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── RESOURCES HANDLERS ───────────────────────────────────────────────────────

async function handleResources(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
): Promise<Response> {
  switch (resource) {
    case "resources-list": {
      const { data } = await admin.from("bookable_resources")
        .select("id,name,type,capacity,hourly_rate,active,branch_id,branches(name)")
        .eq("workspace_id", wsId)
        .order("type", { ascending: true })
        .order("name", { ascending: true })
        .limit(200);
      return json({ "resources-list": data ?? [] });
    }
    case "resources-branches-picker": {
      const { data } = await admin.from("branches")
        .select("id,name")
        .eq("workspace_id", wsId)
        .order("name", { ascending: true });
      return json({ "resources-branches-picker": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── COSTING HANDLERS ─────────────────────────────────────────────────────────

async function handleCosting(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
): Promise<Response> {
  const { data } = await admin.from("cost_items")
    .select("id,category,name,amount,frequency,notes")
    .eq("workspace_id", wsId)
    .order("sort_order", { ascending: true })
    .limit(200);
  return json({ "costing-items": data ?? [] });
}

// ─── ROOM CALENDAR HANDLERS ───────────────────────────────────────────────────

async function handleRoomCalendar(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  const resourceId = asUuid(p.resource_id);
  if (!resourceId) throw BadRequest("params.resource_id (uuid) required");
  const startOfMonth = asIso(p.start_of_month);
  if (!startOfMonth) throw BadRequest("params.start_of_month (ISO date) required");
  const windowStart = new Date(startOfMonth);
  const windowEnd = new Date(windowStart);
  windowEnd.setMonth(windowEnd.getMonth() + 2);
  const { data } = await admin.from("bookings")
    .select("start_time,end_time")
    .eq("workspace_id", wsId)
    .eq("resource_id", resourceId)
    .in("status", ["hold", "confirmed"])
    .gte("end_time", windowStart.toISOString())
    .lt("start_time", windowEnd.toISOString())
    .limit(200);
  return json({ "room-calendar-bookings": data ?? [] });
}

// ─── AUTH CONTEXT + PRINTER CONFIG HANDLERS ───────────────────────────────────

async function handleAuthContext(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  userId: string,
): Promise<Response> {
  switch (resource) {
    case "auth-memberships": {
      const { data } = await admin.from("workspace_members")
        .select("workspace_id,role,branch_id,workspaces(name)")
        .eq("user_id", userId);
      return json({ "auth-memberships": data ?? [] });
    }
    case "auth-first-branch": {
      const { data } = await admin.from("branches")
        .select("id")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return json({ "auth-first-branch": data });
    }
    case "printer-config": {
      const { data } = await admin.from("workspaces")
        .select("printer_config")
        .eq("id", wsId)
        .single();
      return json({ "printer-config": data });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── RECEIPTS HANDLERS ────────────────────────────────────────────────────────

async function handleReceipts(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "receipts-orders-list": {
      // orders has no customer_name column — walk-in names typed without
      // picking/creating a Customer record only ever get folded into `notes`
      // as "Guest: X" by buildOrderNotes() (apps/pos-app/app/pos/order.tsx),
      // and the internal note is folded in the same way as "Note: X". A
      // linked customers row (customer_id) takes priority when present.
      // tax_rate_pct/service_rate_pct/payment_method/ref_number/cash_amount/
      // change_amount are NOT columns on orders (that used to be selected
      // here and always failed outright, so this screen never returned any
      // order). Rates are derived from the order's own stored amounts (not
      // the workspace's *current* rate, which may have changed since);
      // payment method/cash/change come from payment_intents — cash_amount/
      // change_amount specifically from the cash leg's metadata (set by
      // payments-cash-confirm); ref_number is parsed out of notes, the only
      // place a non-cash reference number is actually persisted.
      const PAGE_SIZE = PAGE_SIZES.receiptsOrdersList;
      const from = clampOffset(p.from);
      const to = from + PAGE_SIZE - 1;
      const { data } = await admin.from("orders")
        .select("id,order_no,total,subtotal,tax,service_fee,discount,is_senior_pwd,discount_source,voucher_code,cashier_id,status,created_at,order_type,table_no,serve_location,notes,customers(name)")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .range(from, to);
      const rows = data ?? [];
      const orderIds = rows.map((r: any) => r.id);
      const cashierIds = [...new Set(rows.map((r: any) => r.cashier_id).filter(Boolean))];
      const [{ data: intentRows }, { data: cashierRows }] = await Promise.all([
        orderIds.length > 0
          ? admin.from("payment_intents")
              .select("order_id, provider, metadata, payments(amount)")
              .in("order_id", orderIds)
              .eq("status", "succeeded")
          : Promise.resolve({ data: [] as any[] }),
        // Batched, not one query per row — resolves every distinct cashier_id
        // on this page in a single round-trip (same join reprinting a single
        // receipt uses, see reports-order-detail/transactions-order-detail).
        cashierIds.length > 0
          ? admin.from("workspace_members")
              .select("user_id, profiles(full_name,username)")
              .eq("workspace_id", wsId)
              .in("user_id", cashierIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const cashierNameById = new Map<string, string>();
      for (const m of (cashierRows ?? []) as any[]) {
        const name = m.profiles?.full_name ?? m.profiles?.username;
        if (name) cashierNameById.set(m.user_id, name);
      }
      const intentsByOrder = new Map<string, any[]>();
      for (const intent of (intentRows ?? []) as any[]) {
        const arr = intentsByOrder.get(intent.order_id) ?? [];
        arr.push(intent);
        intentsByOrder.set(intent.order_id, arr);
      }

      const result = rows.map((o: any) => {
        const parsed = parseOrderNotes(o.notes);
        const { customers, notes, cashier_id, ...rest } = o;
        const orderIntents = intentsByOrder.get(o.id) ?? [];
        const cashIntent = orderIntents.find((i: any) => i.provider === "cash");
        const subtotalNum = Number(o.subtotal) || 0;
        // Per-leg amounts (not a joined provider string) — a split-paid order
        // needs each method's own amount to reprint correctly, not just
        // "cash+gcash" with no idea how much was on each.
        const methods = orderIntents.map((i: any) => {
          const legPayments = Array.isArray(i.payments) ? i.payments : (i.payments ? [i.payments] : []);
          const amount = legPayments.reduce((s: number, pay: any) => s + Number(pay?.amount ?? 0), 0);
          return { method: i.provider as string, amount };
        });
        return {
          ...rest,
          customer_name: customers?.name ?? parsed.guestName ?? null,
          internal_note: parsed.internalNote ?? null,
          cashier_name: cashier_id ? cashierNameById.get(cashier_id) ?? null : null,
          tax_rate_pct: subtotalNum > 0 ? (Number(o.tax) / subtotalNum) * 100 : 0,
          service_rate_pct: subtotalNum > 0 ? (Number(o.service_fee) / subtotalNum) * 100 : 0,
          payment_method: methods[0]?.method ?? null,
          payment_methods: methods,
          ref_number: parsed.refNumber,
          cash_amount: cashIntent?.metadata?.cash_received ?? null,
          change_amount: cashIntent?.metadata?.change ?? null,
        };
      });
      return json({ "receipts-orders-list": result });
    }
    case "receipts-order-items": {
      const orderId = asUuid(p.order_id);
      if (!orderId) throw BadRequest("params.order_id (uuid) required");
      const { data } = await admin.from("order_items")
        .select("id,quantity,unit_price,notes,products(name,sku,prep_station),order_item_addons(id,addon_id,name,price,qty)")
        .eq("order_id", orderId);
      const items = (data ?? []).map((item: any) => {
        const { order_item_addons, ...rest } = item;
        return { ...rest, addons: order_item_addons ?? [] };
      });
      return json({ "receipts-order-items": items });
    }
    case "receipts-order-bookings": {
      const orderId = asUuid(p.order_id);
      if (!orderId) throw BadRequest("params.order_id (uuid) required");
      const { data } = await admin.from("order_bookings")
        .select("id,total,resource_name")
        .eq("order_id", orderId);
      return json({ "receipts-order-bookings": data ?? [] });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── VOUCHERS HANDLERS ────────────────────────────────────────────────────────

async function handleVouchers(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  switch (resource) {
    case "vouchers-list": {
      const { data } = await admin.from("vouchers")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .limit(500);
      return json({ "vouchers-list": data ?? [] });
    }
    case "vouchers-redemptions": {
      const { data } = await admin.from("voucher_redemptions")
        .select("id, order_total, discount_amount, redeemed_at, vouchers(code, name)")
        .eq("workspace_id", wsId)
        .order("redeemed_at", { ascending: false })
        .limit(200);
      return json({ "vouchers-redemptions": data ?? [] });
    }
    case "vouchers-check": {
      const code = typeof p.code === "string" ? p.code.trim().toUpperCase() : null;
      if (!code) throw BadRequest("params.code required");
      const { data } = await admin.from("vouchers")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("code", code)
        .maybeSingle();
      return json({ "vouchers-check": data ?? null });
    }
    case "vouchers-validate": {
      // Full server-side validation — same rules as orders-create.
      // Returns { valid, discount_amount, final_total, reason, voucher } without mutating anything.
      const code       = typeof p.code       === "string" ? p.code.trim().toUpperCase() : null;
      const subtotal   = typeof p.subtotal   === "number" ? p.subtotal   : 0;
      const customerId = typeof p.customer_id === "string" ? p.customer_id : null;
      // Optional per-category subtotals for applies_to accuracy
      const foodSub      = typeof p.food_subtotal      === "number" ? p.food_subtotal      : null;
      const drinksSub    = typeof p.drinks_subtotal    === "number" ? p.drinks_subtotal    : null;
      const roomSub      = typeof p.room_subtotal      === "number" ? p.room_subtotal      : null;
      const amenitiesSub = typeof p.amenities_subtotal === "number" ? p.amenities_subtotal : null;

      if (!code) throw BadRequest("params.code required");

      const { data: voucher } = await admin.from("vouchers")
        .select("id,code,name,discount_type,discount_value,max_cap,min_spend,usage_limit,usage_count,one_per_customer,applies_to,valid_from,valid_until,status")
        .eq("workspace_id", wsId)
        .eq("code", code)
        .maybeSingle();

      if (!voucher) return json({ "vouchers-validate": { valid: false, reason: `Voucher "${code}" not found`, discount_amount: 0, final_total: subtotal } });

      const now = new Date();
      if (voucher.status === "disabled")
        return json({ "vouchers-validate": { valid: false, reason: "Voucher is disabled", discount_amount: 0, final_total: subtotal, voucher } });
      if (voucher.valid_until && phEndOfDay(voucher.valid_until) < now)
        return json({ "vouchers-validate": { valid: false, reason: "Voucher has expired", discount_amount: 0, final_total: subtotal, voucher } });
      if (voucher.valid_from && phStartOfDay(voucher.valid_from) > now)
        return json({ "vouchers-validate": { valid: false, reason: `Voucher starts on ${new Date(voucher.valid_from + "T00:00:00+08:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`, discount_amount: 0, final_total: subtotal, voucher } });
      if (voucher.usage_limit !== null && voucher.usage_count >= voucher.usage_limit)
        return json({ "vouchers-validate": { valid: false, reason: "Usage limit reached", discount_amount: 0, final_total: subtotal, voucher } });

      if (customerId && voucher.one_per_customer) {
        const { data: used } = await admin.from("voucher_redemptions")
          .select("id").eq("voucher_id", voucher.id).eq("customer_id", customerId).maybeSingle();
        if (used) return json({ "vouchers-validate": { valid: false, reason: "Customer has already used this voucher", discount_amount: 0, final_total: subtotal, voucher } });
      }

      // Determine applicable base amount using category subtotals when available
      const appliesToBase: Record<string, number | null> = {
        order:     subtotal,
        food:      foodSub      ?? subtotal,
        drinks:    drinksSub    ?? subtotal,
        rooms:     roomSub      ?? subtotal,
        amenities: amenitiesSub ?? subtotal,
      };
      const base = appliesToBase[voucher.applies_to as string] ?? subtotal;

      if (Number(voucher.min_spend) > 0 && base < Number(voucher.min_spend))
        return json({ "vouchers-validate": { valid: false, reason: `Minimum spend of ₱${Number(voucher.min_spend).toFixed(2)} required (${voucher.applies_to === "order" ? "order subtotal" : voucher.applies_to} is ₱${base.toFixed(2)})`, discount_amount: 0, final_total: subtotal, voucher } });

      let discount: number;
      if (voucher.discount_type === "percentage") {
        const raw = base * (Number(voucher.discount_value) / 100);
        discount = voucher.max_cap ? Math.min(raw, Number(voucher.max_cap)) : raw;
      } else {
        discount = Math.min(Number(voucher.discount_value), base);
      }
      discount = +discount.toFixed(2);
      const finalTotal = +Math.max(0, subtotal - discount).toFixed(2);

      return json({ "vouchers-validate": { valid: true, reason: null, discount_amount: discount, final_total: finalTotal, voucher } });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── STAFF HANDLERS ───────────────────────────────────────────────────────────

async function handleStaff(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
): Promise<Response> {
  const { data, error } = await admin.from("workspace_members")
    .select("user_id, role, branch_id, created_at, is_archived, is_suspended, profiles(full_name, username)")
    .eq("workspace_id", wsId)
    .order("created_at");
  if (error) throw BadRequest(error.message);
  return json({ "staff-list": data ?? [] });
}

// ─── CUSTOMERS HANDLERS ───────────────────────────────────────────────────────

async function handleCustomersList(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  const PAGE_SIZE = clampLimit(p.page_size, PAGE_SIZES.customersList, 200);
  const from = clampOffset(p.from);
  const to = from + PAGE_SIZE - 1;
  let q = admin.from("customers")
    .select("id,name,phone,email,notes,created_at,orders(id,total,created_at)", { count: "estimated" })
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false });
  if (typeof p.search === "string" && p.search.trim()) {
    const pattern = ilikePattern(p.search.trim());
    q = q.or(`name.ilike.${pattern},phone.ilike.${pattern}`);
  }
  q = q.range(from, to);
  const { data, count, error } = await q;
  if (error) throw BadRequest(error.message);
  const customers = (data ?? []).map((c: any) => {
    const orders = c.orders ?? [];
    const totalSpend = orders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0);
    const lastOrderAt = orders.reduce((max: string | null, o: any) => (!max || o.created_at > max ? o.created_at : max), null as string | null);
    const { orders: _orders, ...rest } = c;
    return { ...rest, total_orders: orders.length, total_spend: totalSpend, last_order_at: lastOrderAt };
  });
  return json({ "customers-list": customers, total: count ?? 0 });
}

// ─── Z-REPORTS HANDLERS ───────────────────────────────────────────────────────

async function handleZReportsList(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
): Promise<Response> {
  let q = admin.from("z_reports")
    .select("id,branch_id,report_no,report_date,gross_sales,discount_amount,net_sales,vatable_sales,vat_amount,vat_exempt_sales,zero_rated_sales,void_count,void_amount,refund_count,refund_amount,payment_breakdown,order_count,cancelled_count,first_receipt_no,last_receipt_no,opening_float,cash_in,cash_out,expected_cash,cashier_name,created_at,payload,branches(name)")
    .eq("workspace_id", wsId)
    .order("report_date", { ascending: false })
    .limit(365);
  if (typeof p.branch_id === "string" && p.branch_id) q = q.eq("branch_id", p.branch_id);
  const { data, error } = await q;
  if (error) throw BadRequest(error.message);
  return json({ "zreports-list": data ?? [] });
}

// ─── PRINTERS SCREEN HANDLERS ─────────────────────────────────────────────────

async function handlePrinters(
  admin: ReturnType<typeof adminClient>,
  wsId: string,
): Promise<Response> {
  const [printersRes, workspaceRes, catRes] = await Promise.all([
    admin.from("workspace_printers")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false }),
    admin.from("workspaces")
      .select("printer_config")
      .eq("id", wsId)
      .single(),
    admin.from("categories")
      .select("id, name, color")
      .eq("workspace_id", wsId)
      .order("name"),
  ]);
  if (printersRes.error) throw BadRequest(printersRes.error.message);
  return json({
    "printers-load": {
      printers:       printersRes.data ?? [],
      printer_config: workspaceRes.data?.printer_config ?? {},
      categories:     catRes.data ?? [],
    },
  });
}

// ─── BOOKING SCREENS HANDLERS ─────────────────────────────────────────────────

async function handleBookings(
  resource: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any> = {},
  userId?: string,
): Promise<Response> {
  switch (resource) {
    case "booking-amenity-load": {
      const [resRes, bkRes] = await Promise.all([
        admin.from("bookable_resources")
          .select("id, name, capacity, hourly_rate, branch_id")
          .eq("workspace_id", wsId).eq("type", "amenity").eq("active", true)
          .order("name"),
        admin.from("bookings")
          .select("id, resource_id, start_time, end_time, status, payment_status, total, notes, bookable_resources(name)")
          .eq("workspace_id", wsId)
          .in("status", ["hold", "confirmed"])
          .order("start_time"),
      ]);
      return json({
        "booking-amenity-load": {
          resources: resRes.data ?? [],
          bookings:  bkRes.data  ?? [],
        },
      });
    }
    case "booking-room-load": {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const nowISO        = new Date().toISOString();
      const [resRes, bkRes] = await Promise.all([
        admin.from("bookable_resources")
          .select("id, name, type, capacity, hourly_rate, nightly_rate, branch_id")
          .eq("workspace_id", wsId).eq("active", true)
          .order("name"),
        admin.from("bookings")
          .select("id, resource_id, branch_id, start_time, end_time, status, payment_status, amount_paid, total, notes, hold_expires_at, checked_in_at, bookable_resources(name)")
          .eq("workspace_id", wsId)
          .gte("start_time", thirtyDaysAgo)
          // Only active blocking bookings: confirmed, or holds that have not yet expired
          .or(`status.eq.confirmed,and(status.eq.hold,hold_expires_at.gt.${nowISO})`)
          .order("start_time"),
      ]);
      return json({
        "booking-room-load": {
          resources: resRes.data ?? [],
          bookings:  bkRes.data  ?? [],
        },
      });
    }
    // NOTE: this is a write despite living in the "read endpoint" file (see header
    // comment) — pre-existing, not introduced here. A dedicated edge function
    // (mirroring bookings-mark-paid / payments-cash-confirm) would be cleaner but
    // is a bigger refactor than this bug fix warrants.
    case "booking-epayment-confirm": {
      const orderId      = p.order_id as string | undefined;
      const payStatus    = p.payment_status === "partial" ? "partial" : "paid";
      const refNum       = (p.ref_number as string | undefined) ?? null;
      const payMethod    = (p.pay_method as string | undefined) ?? "other";
      const actorId      = userId;
      if (!orderId) throw BadRequest("order_id required");
      const depositAmt   = typeof p.deposit_amount === "number" ? p.deposit_amount : null;
      // Resolve booking IDs from junction table (bookings have no direct order_id column)
      const { data: links } = await admin.from("order_booking_link")
        .select("booking_id").eq("order_id", orderId);
      const bookingIds = (links ?? []).map((l: { booking_id: string }) => l.booking_id);
      const { data: bks, error: bkErr } = bookingIds.length > 0
        ? await admin.from("bookings").select("id, branch_id, notes, total, amount_paid")
            .in("id", bookingIds).eq("workspace_id", wsId)
        : { data: [], error: null };
      if (bkErr) throw BadRequest(bkErr.message);
      for (const bk of bks ?? []) {
        const updatedNotes = refNum
          ? [bk.notes, `Ref: ${refNum}`].filter(Boolean).join(" · ")
          : bk.notes;
        const alreadyPaid = Number(bk.amount_paid ?? 0);
        // Amount actually collected THIS confirmation — a deposit top-up, or the
        // remaining balance when marking fully paid. Never re-charges what a
        // prior deposit already covered.
        const chargeAmount = depositAmt != null
          ? depositAmt
          : +(Number(bk.total) - alreadyPaid).toFixed(2);
        const updatePay: Record<string, unknown> = { payment_status: payStatus, notes: updatedNotes };
        if (depositAmt != null) {
          updatePay.amount_paid = +(alreadyPaid + depositAmt).toFixed(2);
        } else if (payStatus === "paid") {
          updatePay.amount_paid = Number(bk.total);
        }
        await admin.from("bookings").update(updatePay).eq("id", bk.id);

        // Record the same payment_intents/transactions trail cash bookings get
        // (payments-cash-confirm) so this booking's revenue is visible to the
        // Z-report and satisfies bookings-cancel's "already paid" guard, which
        // only checks payment_intents.booking_id. Previously this case only
        // flipped bookings.payment_status/amount_paid with no money-in record
        // anywhere — e-payment bookings were invisible to every revenue report.
        if (chargeAmount > 0) {
          const { data: intent } = await admin.from("payment_intents").insert({
            workspace_id: wsId, booking_id: bk.id,
            provider: payMethod, amount: chargeAmount, currency: "PHP", status: "succeeded",
            metadata: { manual: true, by: actorId, ref_number: refNum },
          }).select().single();
          if (intent) {
            await admin.from("booking_payment_transactions").insert({
              booking_id: bk.id, workspace_id: wsId,
              amount: chargeAmount, method: payMethod, type: "charge",
              reference: intent.id, actor_id: actorId,
            });
            await admin.from("transactions").insert({
              workspace_id: wsId, branch_id: bk.branch_id,
              type: "sale", status: "completed",
              reference_table: "bookings", reference_id: bk.id,
              amount: chargeAmount, created_by: actorId, payment_method: payMethod,
            }).then(() => {}).catch((e: unknown) => {
              console.error("[booking-epayment-confirm] transactions insert failed:", e);
            });
          }
        }
      }
      return json({ updated: (bks ?? []).length, payment_status: payStatus });
    }
    default: throw BadRequest("Unknown resource");
  }
}

// ─── MAIN REQUEST HANDLER (dispatcher only) ───────────────────────────────────

function enforceResourceRole(
  ctx: Awaited<ReturnType<typeof requireAuth>>,
  resource: string,
): void {
  if (KITCHEN_RESOURCES.has(resource)) {
    requireRole(ctx, KITCHEN_WRITE);
  } else {
    requireRole(ctx, STAFF_WRITE);
  }
}

async function dispatchResource( // NOSONAR
  r: string,
  admin: ReturnType<typeof adminClient>,
  wsId: string,
  p: Record<string, any>,
  userId: string,
): Promise<Response> {
  if (r.startsWith("dashboard-"))    return handleDashboard(r, admin, wsId, p);
  if (r.startsWith("home-"))         return handleHome(r, admin, wsId, p);
  if (r.startsWith("order-"))        return handleOrder(r, admin, wsId, p);
  if (r.startsWith("products-"))     return handleProducts(r, admin, wsId, p);
  if (r.startsWith("reports-"))      return handleReports(r, admin, wsId, p);
  if (r.startsWith("transactions-")) return handleTransactions(r, admin, wsId, p);
  if (r.startsWith("kitchen-"))      return handleKitchen(r, admin, wsId, p);
  if (r.startsWith("audit-"))        return handleAudit(r, admin, wsId, p);
  if (r.startsWith("settings-"))     return handleSettings(r, admin, wsId);
  if (r.startsWith("resources-"))    return handleResources(r, admin, wsId);
  if (r.startsWith("receipts-"))     return handleReceipts(r, admin, wsId, p);
  if (r.startsWith("vouchers-"))     return handleVouchers(r, admin, wsId, p);
  if (r.startsWith("booking-"))      return handleBookings(r, admin, wsId, p, userId);
  if (r === "inventory-list" || r === "inventory-untracked-products")
    return handleInventoryAndIngredients(r, admin, wsId, p);
  if (r === "auth-memberships" || r === "auth-first-branch" || r === "printer-config")
    return handleAuthContext(r, admin, wsId, userId);
  if (r === "costing-items")         return handleCosting(admin, wsId);
  if (r === "room-calendar-bookings") return handleRoomCalendar(admin, wsId, p);
  if (r === "staff-list")            return handleStaff(admin, wsId);
  if (r === "customers-list")        return handleCustomersList(admin, wsId, p);
  if (r === "zreports-list")         return handleZReportsList(admin, wsId, p);
  if (r === "printers-load")         return handlePrinters(admin, wsId);
  throw BadRequest("Unknown resource");
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    enforceResourceRole(ctx, body.resource);
    const admin = adminClient();
    return await dispatchResource(
      body.resource,
      admin,
      body.workspace_id,
      body.params as Record<string, any>,
      ctx.userId,
    );
  } catch (err) { return handleError(err); }
});
