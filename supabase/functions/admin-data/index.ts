// POST /admin-data — single read endpoint for every admin page.
// Replaces the per-page direct supabase.from(...).select() calls that the
// FE was doing. Auth + workspace scoping happens in one place.
//
// Body shape: { workspace_id, resource: "...", params?: {...} }
// Each resource case below returns the exact shape its admin page expects,
// so the FE refactor is a near-1:1 swap.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  resource: z.enum([
    "context",
    "dashboard",
    "orders",
    "kitchen",
    "kitchen-history",
    "bookings",
    "branches",
    "employees",
    "transactions",
    "reports",
    "audit-logs",
    "products",
    "product-categories",
    "inventory",
    "stock-movements",
    "resources",
    "resource-blocks",
    "costs",
    "recipe-items",
    "menu-book",
    "customers",
    "online-customers",
    "refunds",
    "attendance",
    "role-permissions",
  ]),
  params: z.record(z.unknown()).optional().default({}),
});

const ADMIN_READ = Roles.STAFF_WRITE; // owner/admin/manager/cashier — same set used by writes

function clampLimit(v: unknown, def = 50, max = 200): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}
function clampOffset(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT_RE = /^[a-z0-9_]{1,40}$/i;
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

type AdminClient = ReturnType<typeof adminClient>;

async function handleContext(admin: AdminClient, wsId: string, _p: Record<string, any>, ctx: { role: string }) {
  const { data: ws } = await admin.from("workspaces")
    .select("id, name, slug, currency, tax_rate, service_rate, phone, hold_minutes, slot_minutes, receipt_address, receipt_tin, receipt_footer, payment_config, maintenance_mode, maintenance_message, home_content, created_at")
    .eq("id", wsId).maybeSingle();
  return json({ workspace: ws, role: ctx.role });
}

async function handleDashboard(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  // Use Manila (UTC+8) midnight so the server boundary aligns with client-side date filtering
  const manilaStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const todayStart = new Date(manilaStr); todayStart.setHours(0, 0, 0, 0);
  // Convert back to UTC for the DB query
  const todayStartUtc = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
  const todayEndUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  const [allOrders, todayOrders, kitchenTickets, transactions, activeBookings, bookingPayments] = await Promise.all([
    admin.from("orders")
      .select("id, status, total, created_at, order_no, table_no, branches(name)")
      .eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(50),
    admin.from("orders").select("id, total, status, is_online")
      .eq("workspace_id", wsId).gte("created_at", todayStartUtc.toISOString()),
    admin.from("kitchen_tickets")
      .select("id, kitchen_status, order_id, orders(order_no, table_no)")
      .eq("workspace_id", wsId)
      .not("kitchen_status", "in", "(served,completed)").limit(100),
    admin.from("transactions").select("id, amount, type, status, payment_method")
      .eq("workspace_id", wsId).gte("created_at", todayStartUtc.toISOString()),
    admin.from("bookings").select("id, status")
      .eq("workspace_id", wsId).in("status", ["confirmed", "hold", "checked_in"]),
    // Merge today's confirmed booking payments so dashboard revenue matches reports.
    admin.from("payment_intents").select("id, amount, status, provider, created_at")
      .eq("workspace_id", wsId).eq("status", "succeeded")
      .gte("created_at", todayStartUtc.toISOString())
      .lt("created_at", todayEndUtc.toISOString()),
  ]);

  // Merge booking payment_intents into the transactions array so dashboard KPIs
  // include booking revenue (same merge logic as handleReports).
  const bookingTxs = (bookingPayments.data ?? []).map((pi: any) => ({
    id:             pi.id,
    amount:         pi.amount,
    type:           "sale",
    status:         "completed",
    created_at:     pi.created_at,
    payment_method: pi.provider ?? "online",
  }));

  return json({
    recent_orders:    allOrders.data ?? [],
    today_orders:     todayOrders.data ?? [],
    kitchen_tickets:  kitchenTickets.data ?? [],
    transactions:     [...(transactions.data ?? []), ...bookingTxs],
    active_bookings:  activeBookings.data ?? [],
  });
}

async function handleOrders(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const limit  = clampLimit(p.limit, 50, 200);
  const offset = clampOffset(p.offset);
  let q = admin.from("orders").select(`
    id, order_no, status, payment_status, type, source, total, subtotal, tax,
    service_fee, discount, discount_source, voucher_code,
    table_no, notes, cancel_reason, cancelled_at, created_at,
    branches(name), customers(name, phone),
    order_items(id, quantity, unit_price, total, status, products(name),
      kitchen_ticket_items(kitchen_tickets(kitchen_status)))
  `, { count: "exact" }).eq("workspace_id", wsId);
  const oStatus = asIdent(p.status); if (oStatus) q = q.eq("status", oStatus);
  const oBranch = asUuid(p.branch);  if (oBranch) q = q.eq("branch_id", oBranch);
  const oSource = asIdent(p.source); if (oSource) q = q.eq("source", oSource);
  q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  const { data, count } = await q;
  return json({ orders: data ?? [], total: count ?? 0, limit, offset });
}

async function handleKitchen(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  // Items via kitchen_ticket_items — already scoped to this station ticket by orders-create.
  // Using order_items through orders had a bug: prep_station="none"+kitchen_required=true
  // items were excluded by the client-side station filter (("none"??"kitchen")==="kitchen" → false).
  const { data } = await admin.from("kitchen_tickets")
    .select(`id, kitchen_status, station, created_at, started_at, ready_at, order_id,
      orders(order_no, table_no, source, customers(name)),
      kitchen_ticket_items(order_items(quantity, notes, products(name)))`)
    .eq("workspace_id", wsId)
    .not("kitchen_status", "in", "(served,completed)")
    .order("created_at", { ascending: true });
  return json({ tickets: data ?? [] });
}

async function handleKitchenHistory(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const limit = Math.min(Number(p.limit ?? 50), 200);
  const { data } = await admin.from("kitchen_tickets")
    .select(`id, kitchen_status, station, started_at, ready_at, completed_at, created_at,
      orders(order_no, table_no, customers(name)),
      kitchen_ticket_items(order_items(quantity, notes, products(name)))`)
    .eq("workspace_id", wsId)
    .in("kitchen_status", ["served", "completed"])
    .order("completed_at", { ascending: false })
    .limit(limit);
  return json({ tickets: data ?? [] });
}

async function handleBookings(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const limit  = clampLimit(p.limit, 50, 200);
  const offset = clampOffset(p.offset);
  let q = admin.from("bookings").select(`
    id, status, payment_status, amount_paid, start_time, end_time, total, notes, created_at, resource_id, checked_in_at,
    reschedule_count, rescheduled_from_booking_id, rescheduled_to_booking_id,
    customers(name, phone, email),
    bookable_resources(name, type),
    branches(name),
    payment_intents(id, status, amount, provider)
  `, { count: "exact" }).eq("workspace_id", wsId);
  const bStatus = asIdent(p.status); if (bStatus) q = q.eq("status", bStatus);
  q = q.order("start_time", { ascending: true }).range(offset, offset + limit - 1);
  const { data, count } = await q;
  return json({ bookings: data ?? [], total: count ?? 0, limit, offset });
}

async function handleBranches(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const { data } = await admin.from("branches")
    .select("id, name, address, accepting_orders, accepting_bookings, created_at")
    .eq("workspace_id", wsId).order("created_at");
  return json({ branches: data ?? [] });
}

async function handleEmployees(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const { data } = await admin.from("workspace_members")
    .select("user_id, role, branch_id, is_suspended, is_archived, created_at, profiles(full_name, phone), branches(id, name)")
    .eq("workspace_id", wsId).order("created_at");
  return json({ members: data ?? [] });
}

async function handleTransactions(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const limit  = clampLimit(p.limit, 50, 500);
  const offset = clampOffset(p.offset);
  let q = admin.from("transactions").select(`
    id, type, status, amount, reference_table, reference_id, created_at, branch_id, voided_reason, payment_method
  `, { count: "exact" }).eq("workspace_id", wsId);
  const tType   = asIdent(p.type);   if (tType)   q = q.eq("type", tType);
  const tStatus = asIdent(p.status); if (tStatus) q = q.eq("status", tStatus);
  const fromDt  = asIso(p.from);     if (fromDt)  q = q.gte("created_at", fromDt);
  const toDt    = asIso(p.to);       if (toDt)    q = q.lte("created_at", toDt + "T23:59:59.999Z");
  q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  const { data, count } = await q;
  return json({ transactions: data ?? [], total: count ?? 0, limit, offset });
}

async function handleReports(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const days = Math.min(Math.max(Number(p.days ?? 30), 1), 365);
  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10); // YYYY-MM-DD for expenses.expense_date
  const [orders, transactions, items, bookingPayments, expenses] = await Promise.all([
    admin.from("orders").select("id, total, status, created_at, type")
      .eq("workspace_id", wsId).gte("created_at", since.toISOString()),
    admin.from("transactions").select("id, amount, type, status, created_at, payment_method")
      .eq("workspace_id", wsId).gte("created_at", since.toISOString()),
    admin.from("order_items").select("quantity, total, products(name, cost), orders!inner(workspace_id, created_at)")
      .eq("orders.workspace_id", wsId).gte("orders.created_at", since.toISOString()).limit(1000),
    admin.from("payment_intents").select("id, amount, status, provider, created_at")
      .eq("workspace_id", wsId).eq("status", "succeeded").gte("created_at", since.toISOString()),
    admin.from("expenses").select("id, expense_date, amount, expense_categories(name)")
      .eq("workspace_id", wsId).gte("expense_date", sinceDate),
  ]);

  // Merge confirmed booking payments into the transactions array so the
  // reports reflect total revenue including room bookings.
  const bookingTxs = (bookingPayments.data ?? []).map((pi: any) => ({
    id:             pi.id,
    amount:         pi.amount,
    type:           "sale",
    status:         "completed",
    created_at:     pi.created_at,
    payment_method: pi.provider ?? "online",
  }));

  return json({
    orders:       orders.data ?? [],
    transactions: [...(transactions.data ?? []), ...bookingTxs],
    order_items:  items.data ?? [],
    expenses:     expenses.data ?? [],
  });
}

// Maps user-facing filter keys to canonical DB entity_type column values.
// UI labels can differ from DB values (e.g. "inventory" → "inventory_item").
const AUDIT_ENTITY_MAP: Record<string, string> = {
  inventory: "inventory_item",    // inventory-adjust, stock-in, stock-out
  staff:     "workspace_member",  // employees-*, staff-*
  prep:      "kitchen_ticket",    // kitchen-update-status
};

async function handleAuditLogs(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const limit  = clampLimit(p.limit, 100, 500);
  const offset = clampOffset(p.offset);
  // audit_logs.actor_id FKs to auth.users (not profiles), so it can't be
  // embedded via PostgREST — doing so silently errors and returns nothing.
  // Fetch the rows, then resolve actor names from profiles separately.
  let q = admin.from("audit_logs")
    .select("id, action, entity_type, entity_id, before, after, created_at, actor_id", { count: "exact" })
    .eq("workspace_id", wsId);
  const rawEntity = asIdent(p.entity_type);
  const aEntity   = rawEntity ? (AUDIT_ENTITY_MAP[rawEntity] ?? rawEntity) : null;
  if (aEntity) q = q.eq("entity_type", aEntity);
  const aSince  = asIso(p.since);          if (aSince)  q = q.gte("created_at", aSince);
  q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  const { data, count, error } = await q;
  if (error) throw BadRequest(error.message);
  const logs = data ?? [];
  const actorIds = [...new Set(logs.map((l: any) => l.actor_id).filter(Boolean))];
  let nameById: Record<string, string> = {};
  if (actorIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", actorIds);
    nameById = Object.fromEntries((profs ?? []).map((pr: any) => [pr.id, pr.full_name]));
  }
  const withNames = logs.map((l: any) => ({
    ...l,
    profiles: l.actor_id && nameById[l.actor_id] ? { full_name: nameById[l.actor_id] } : null,
  }));
  return json({ logs: withNames, total: count ?? 0, limit, offset });
}

async function handleAttendance(admin: AdminClient, wsId: string, p: Record<string, any>) {
  // attendance_records.user_id FKs to auth.users (not profiles), so it can't
  // be embedded via PostgREST — same limitation as audit_logs.actor_id above.
  const { data, error } = await admin.from("attendance_records")
    .select("id, user_id, branch_id, clock_in, clock_out")
    .eq("workspace_id", wsId)
    .order("clock_in", { ascending: false })
    .limit(500);
  if (error) throw BadRequest(error.message);
  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
  let nameById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", userIds);
    nameById = Object.fromEntries((profs ?? []).map((pr: any) => [pr.id, pr.full_name]));
  }
  const records = rows.map((r: any) => ({ ...r, staff_name: nameById[r.user_id] ?? "Unknown" }));
  return json({ records });
}

async function handleRolePermissions(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const { data, error } = await admin.from("role_permissions")
    .select("role, feature, granted").eq("workspace_id", wsId);
  if (error) throw BadRequest(error.message);
  return json({ overrides: data ?? [] });
}

async function handleProducts(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const includeArchived = p.include_archived === true || p.include_archived === "true";
  let q = admin.from("products")
    .select("id, name, sku, barcode, price, cost, category_id, kitchen_required, prep_station, active, archived, stock_auto_deactivated, for_sale, is_pinned, image_url, featured, featured_tag, featured_blurb, featured_sort, purchase_unit, selling_unit, track_inventory, product_categories(name, sort_order)")
    .eq("workspace_id", wsId).order("active", { ascending: false });
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return json({ products: data ?? [] });
}

async function handleProductCategories(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const { data } = await admin.from("product_categories")
    .select("id, name, sort_order")
    .eq("workspace_id", wsId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return json({ categories: data ?? [] });
}

// One unified inventory catalog — raw materials and products that track
// their own stock both live in inventory_catalog, each with a nested array
// of per-branch stock rows (inventory_items). A catalog entry with no stock
// rows yet (never stocked at any branch) still appears, with an empty array.
async function handleInventory(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const includeArchived = p.include_archived === true || p.include_archived === "true";
  let q = admin.from("inventory_catalog")
    .select("id, name, category, unit, cost_per_unit, low_stock_threshold, archived, product_id, expiry_date, batch_number, products(id, name, sku, for_sale, product_categories(name, sort_order)), inventory_items(id, branch_id, quantity, low_stock_threshold, branches(name))")
    .eq("workspace_id", wsId)
    .order("name", { ascending: true });
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return json({ items: data ?? [] });
}

async function handleStockMovements(admin: AdminClient, wsId: string, p: Record<string, any>) {
  let q = admin.from("stock_movements")
    .select("id, inventory_item_id, type, quantity, reason, user_id, created_at, unit_cost, supplier, order_id, refund_id")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .limit(200);
  const smItem = asUuid(p.inventory_item_id); if (smItem) q = q.eq("inventory_item_id", smItem);
  const smType = asIdent(p.type);             if (smType) q = q.eq("type", smType);
  const { data } = await q;
  return json({ movements: data ?? [] });
}

async function handleResources(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const { data } = await admin.from("bookable_resources")
    .select(`id, name, type, capacity, hourly_rate, active, branch_id, created_at,
      nightly_rate, short_description, description, base_pax, max_pax,
      extra_pax_fee, security_deposit, cleaning_fee,
      check_in_time, check_out_time, inclusions, photos, cover_photo,
      house_rules, min_nights, branches(name)`)
    .eq("workspace_id", wsId).order("type").order("name");
  return json({ resources: data ?? [] });
}

async function handleResourceBlocks(admin: AdminClient, wsId: string, p: Record<string, any>) {
  let q = admin.from("resource_blocks")
    .select("id, resource_id, branch_id, start_date, end_date, block_type, reason, is_active, created_by, created_at, bookable_resources(name, type)")
    .eq("workspace_id", wsId)
    .eq("is_active", true);
  const rbResource = asUuid(p.resource_id); if (rbResource) q = q.eq("resource_id", rbResource);
  q = q.order("start_date", { ascending: true }).limit(500);
  const { data } = await q;
  return json({ blocks: data ?? [] });
}

async function handleCosts(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const { data } = await admin.from("cost_items")
    .select("id, category, name, amount, frequency, notes, sort_order")
    .eq("workspace_id", wsId).order("sort_order").limit(200);
  return json({ costs: data ?? [] });
}

async function handleRecipeItems(admin: AdminClient, wsId: string, p: Record<string, any>) {
  let q = admin.from("recipe_items")
    .select("id, product_id, catalog_id, qty_used, section, inventory_catalog(name, unit, cost_per_unit, product_id)")
    .eq("workspace_id", wsId);
  const rProd = asUuid(p.product_id); if (rProd) q = q.eq("product_id", rProd);
  const { data } = await q.limit(500);
  return json({ items: (data ?? []).map((r: any) => ({ ...r, qty: r.qty_used, unit: r.inventory_catalog?.unit ?? "pcs", section: r.section ?? "ingredient" })) });
}

async function handleMenuBook(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const [pages, hotspots] = await Promise.all([
    admin.from("menu_book_pages")
      .select("page_no, label, file_name, image_path")
      .eq("workspace_id", wsId).order("sort_order"),
    admin.from("menu_book_hotspots")
      .select("page_no, shape, x, y, w, h, points, blend_color, name, price, cat, product_id, sort_order")
      .eq("workspace_id", wsId).order("sort_order"),
  ]);
  const bucket = admin.storage.from("menu-book");
  const outPages = (pages.data ?? []).map((p: any) => ({
    page_no: p.page_no,
    label: p.label,
    file_name: p.file_name ?? null,
    image_path: p.image_path ?? null,
    image_url: p.image_path ? bucket.getPublicUrl(p.image_path).data.publicUrl : null,
  }));
  return json({ pages: outPages, hotspots: hotspots.data ?? [] });
}

async function handleCustomers(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const limit  = clampLimit(p.limit, 200, 1000);
  const offset = clampOffset(p.offset);
  const { data, count } = await admin.from("customers")
    .select("id, name, phone, email, created_at, points_balance, orders(id, total, status)", { count: "exact" })
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return json({ customers: data ?? [], total: count ?? 0, limit, offset });
}

async function handleOnlineCustomers(admin: AdminClient, wsId: string, _p: Record<string, any>) {
  const { data } = await admin.from("orders")
    .select("id, total, status, notes, created_at, customers(id, name, phone)")
    .eq("workspace_id", wsId)
    .eq("type", "delivery")
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })
    .limit(2000);
  return json({ orders: data ?? [] });
}

async function handleRefunds(admin: AdminClient, wsId: string, p: Record<string, any>) {
  const page    = Math.max(1, Math.floor(Number(p.page ?? 1)));
  const perPage = clampLimit(p.per_page, 50, 200);
  const from    = (page - 1) * perPage;
  const to      = page * perPage - 1;

  const dateFrom   = asIso(p.date_from);
  const dateTo     = asIso(p.date_to);
  const refundType = typeof p.refund_type === "string" && ["cash", "xendit"].includes(p.refund_type)
    ? p.refund_type as "cash" | "xendit"
    : "all";

  // Step 1 — fetch refunds scoped to workspace via payment_intents.workspace_id.
  // PostgREST doesn't allow filtering on a joined FK column directly, so we do
  // a two-step: first get all payment_intent_ids that belong to this workspace,
  // then filter refunds by those ids.
  const { data: piRows } = await admin
    .from("payment_intents")
    .select("id, provider")
    .eq("workspace_id", wsId);

  const piIds = (piRows ?? []).map((r: any) => r.id as string);
  if (piIds.length === 0) {
    return json({ refunds: [], total_count: 0, total_amount: 0 });
  }

  // Build provider lookup map
  const providerById: Record<string, string> = {};
  for (const r of (piRows ?? [])) {
    providerById[r.id] = r.provider ?? "cash";
  }

  // Apply provider/type filter early — remove PI ids that don't match
  let filteredPiIds = piIds;
  if (refundType !== "all") {
    const targetProvider = refundType === "xendit" ? "xendit" : "cash";
    filteredPiIds = piIds.filter((id) => providerById[id] === targetProvider);
    if (filteredPiIds.length === 0) {
      return json({ refunds: [], total_count: 0, total_amount: 0 });
    }
  }

  // Step 2 — fetch refunds
  let q = admin
    .from("refunds")
    .select("id, created_at, amount, currency, reason, status, payment_intent_id, order_id, manager_approval_id", { count: "exact" })
    .in("payment_intent_id", filteredPiIds);

  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) {
    // dateTo is start-of-day; include the full day
    const endOfDay = new Date(dateTo);
    endOfDay.setDate(endOfDay.getDate() + 1);
    q = q.lt("created_at", endOfDay.toISOString());
  }

  q = q.order("created_at", { ascending: false }).range(from, to);
  const { data: refundRows, count, error } = await q;
  if (error) throw BadRequest(error.message);

  const rows = refundRows ?? [];

  // Step 3 — get order_no for each unique order_id
  const orderIds = [...new Set(rows.map((r: any) => r.order_id).filter(Boolean))];
  let orderNoById: Record<string, string> = {};
  if (orderIds.length) {
    const { data: orderRows } = await admin
      .from("orders")
      .select("id, order_no")
      .in("id", orderIds);
    orderNoById = Object.fromEntries((orderRows ?? []).map((o: any) => [o.id, o.order_no]));
  }

  // Step 4 — get approver names from manager_approvals → workspace_members → profiles
  const approvalIds = [...new Set(rows.map((r: any) => r.manager_approval_id).filter(Boolean))];
  let approverNameByApprovalId: Record<string, string> = {};
  if (approvalIds.length) {
    const { data: approvalRows } = await admin
      .from("manager_approvals")
      .select("id, approver_id")
      .in("id", approvalIds);
    const approverIds = [...new Set((approvalRows ?? []).map((a: any) => a.approver_id).filter(Boolean))];
    let nameById: Record<string, string> = {};
    if (approverIds.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", approverIds);
      nameById = Object.fromEntries((profs ?? []).map((pr: any) => [pr.id, pr.full_name ?? ""]));
    }
    approverNameByApprovalId = Object.fromEntries(
      (approvalRows ?? []).map((a: any) => [a.id, nameById[a.approver_id] ?? ""])
    );
  }

  // Step 5 — assemble rows
  const totalAmount = rows.reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
  const assembled = rows.map((r: any) => ({
    id:                  r.id,
    created_at:          r.created_at,
    amount:              r.amount,
    currency:            r.currency ?? "PHP",
    reason:              r.reason ?? null,
    status:              r.status ?? null,
    provider:            providerById[r.payment_intent_id] ?? "cash",
    order_id:            r.order_id ?? null,
    order_no:            r.order_id ? (orderNoById[r.order_id] ?? null) : null,
    manager_approval_id: r.manager_approval_id ?? null,
    approved_by_name:    r.manager_approval_id
      ? (approverNameByApprovalId[r.manager_approval_id] ?? null)
      : null,
  }));

  return json({ refunds: assembled, total_count: count ?? 0, total_amount: totalAmount });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, ADMIN_READ);

    const admin = adminClient();
    const wsId = body.workspace_id;
    const p = body.params as Record<string, any>;

    switch (body.resource) {
      case "context":            return await handleContext(admin, wsId, p, ctx);
      case "dashboard":          return await handleDashboard(admin, wsId, p);
      case "orders":             return await handleOrders(admin, wsId, p);
      case "kitchen":            return await handleKitchen(admin, wsId, p);
      case "kitchen-history":    return await handleKitchenHistory(admin, wsId, p);
      case "bookings":           return await handleBookings(admin, wsId, p);
      case "branches":           return await handleBranches(admin, wsId, p);
      case "employees":          return await handleEmployees(admin, wsId, p);
      case "transactions":       return await handleTransactions(admin, wsId, p);
      case "reports":            return await handleReports(admin, wsId, p);
      case "audit-logs":         return await handleAuditLogs(admin, wsId, p);
      case "products":           return await handleProducts(admin, wsId, p);
      case "product-categories": return await handleProductCategories(admin, wsId, p);
      case "inventory":          return await handleInventory(admin, wsId, p);
      case "stock-movements":    return await handleStockMovements(admin, wsId, p);
      case "resources":          return await handleResources(admin, wsId, p);
      case "resource-blocks":    return await handleResourceBlocks(admin, wsId, p);
      case "costs":              return await handleCosts(admin, wsId, p);
      case "recipe-items":       return await handleRecipeItems(admin, wsId, p);
      case "menu-book":          return await handleMenuBook(admin, wsId, p);
      case "customers":          return await handleCustomers(admin, wsId, p);
      case "online-customers":   return await handleOnlineCustomers(admin, wsId, p);
      case "refunds":            return await handleRefunds(admin, wsId, p);
      case "attendance":         return await handleAttendance(admin, wsId, p);
      case "role-permissions":   return await handleRolePermissions(admin, wsId, p);
    }

    throw BadRequest("Unknown resource");
  } catch (err) { return handleError(err); }
});
