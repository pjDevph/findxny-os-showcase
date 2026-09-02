// POST /pos-shift — multiplexed shift API: open / close / cash event / summary.
// Each action has its own zod-validated body schema.
import { adminClient } from "../_shared/supabaseClient.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, Conflict } from "../_shared/errors.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";

const Open = z.object({
  action:        z.literal("open_shift"),
  workspace_id:  z.string().uuid(),
  branch_id:     z.string().uuid().nullable().optional(),
  register_id:   z.string().uuid(),
  cashier_name:  z.string().min(1),
  opening_float: z.number().nonnegative().optional().default(0),
  device_id:     z.string().nullable().optional(),
});

const ListRegisters = z.object({
  action:       z.literal("list_registers"),
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid(),
});

const Close = z.object({
  action:        z.literal("close_shift"),
  shift_id:      z.string().uuid(),
  // Cashier's blind physical count — required, this is what gets reconciled
  // against the server-computed expected total later by a manager.
  closing_float: z.number().nonnegative(),
});

const CashEvent = z.object({
  action:       z.literal("cash_event"),
  workspace_id: z.string().uuid(),
  shift_id:     z.string().uuid().nullable().optional(),
  branch_id:    z.string().uuid().nullable().optional(),
  type:         z.enum(["sale", "refund", "cash_in", "cash_out", "closing_count"]),
  amount:       z.number(),
  reason:       z.string().nullable().optional(),
  reference_id: z.string().nullable().optional(),
});

const Summary = z.object({
  action:   z.literal("get_summary"),
  shift_id: z.string().uuid(),
});

const ShiftReport = z.object({
  action:      z.literal("get_shift_report"),
  shift_id:    z.string().uuid(),
  // Optional — when omitted, uses the shift's already-persisted closing_float
  // (the manager reconciliation view reads the stored blind count rather
  // than asking anyone to re-type it).
  actual_cash: z.number().nonnegative().optional(),
});

const ClockIn = z.object({
  action:   z.literal("clock_in"),
  shift_id: z.string().uuid(),
});

const ClockOut = z.object({
  action:   z.literal("clock_out"),
  shift_id: z.string().uuid(),
});

const BreakIn = z.object({
  action:   z.literal("break_in"),
  shift_id: z.string().uuid(),
});

const BreakOut = z.object({
  action:   z.literal("break_out"),
  shift_id: z.string().uuid(),
});

const ListPendingReconciliation = z.object({
  action:       z.literal("list_pending_reconciliation"),
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().optional(),
});

const ReconcileShift = z.object({
  action:       z.literal("reconcile_shift"),
  workspace_id: z.string().uuid(),
  shift_id:     z.string().uuid(),
  notes:        z.string().max(500).optional(),
});

const Body = z.discriminatedUnion("action", [
  Open, Close, CashEvent, Summary, ShiftReport, ClockIn, ClockOut, BreakIn, BreakOut,
  ListRegisters, ListPendingReconciliation, ReconcileShift,
]);

// Actions that reveal the drawer's expected-vs-actual math, or that
// reconcile a shift — reserved for manager+ so a cashier can never see (and
// therefore never pad a blind count to match) the target figure before or
// after counting. Logging a Cash In/Out (cash_event) does NOT reveal that
// math, so any staff member running a shift can do it.
const MANAGER_ONLY_ACTIONS = new Set(["get_shift_report", "list_pending_reconciliation", "reconcile_shift"]);

type Sb = ReturnType<typeof adminClient>;

async function resolveWorkspaceId(sb: Sb, body: z.infer<typeof Body>): Promise<string> {
  if ("workspace_id" in body && body.workspace_id) return body.workspace_id;
  const { data: shift } = await sb.from("shifts").select("workspace_id").eq("id", (body as any).shift_id).single();
  if (!shift) throw BadRequest("Shift not found");
  return shift.workspace_id;
}

async function handleListRegisters(sb: Sb, body: z.infer<typeof ListRegisters>) {
  const { data: registers, error } = await sb.from("branch_registers")
    .select("id, name")
    .eq("workspace_id", body.workspace_id)
    .eq("branch_id", body.branch_id)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw BadRequest(error.message);

  const { data: openShifts } = await sb.from("shifts")
    .select("id, register_id, cashier_name, opened_at")
    .eq("branch_id", body.branch_id)
    .eq("status", "open");

  const openByRegister = new Map((openShifts ?? []).map((s) => [s.register_id, s]));
  const result = (registers ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    openShift: openByRegister.get(r.id) ?? null,
  }));
  return json({ ok: true, registers: result });
}

async function handleOpenShift(sb: Sb, body: z.infer<typeof Open>, actorId: string) {
  if (body.device_id) {
    await sb.from("shifts")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("device_id", body.device_id).eq("status", "open");
  }

  // Block a new shift from opening on top of one still open for this
  // *register* (possibly on a different device) — the previous cashier on
  // that till must close out first. Scoped per-register (not per-branch) so
  // several registers at the same branch can run concurrent shifts.
  const { data: stillOpen } = await sb.from("shifts")
    .select("id, cashier_name, opened_at")
    .eq("register_id", body.register_id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1);
  const openShift = stillOpen?.[0];
  if (openShift) {
    throw Conflict(
      `This register already has a shift open, started by ${openShift.cashier_name}. It must be closed before a new shift can open.`,
    );
  }

  const { data: shift, error } = await sb.from("shifts").insert({
    workspace_id:  body.workspace_id,
    branch_id:     body.branch_id ?? null,
    register_id:   body.register_id,
    device_id:     body.device_id ?? null,
    cashier_id:    actorId,
    cashier_name:  body.cashier_name,
    opening_float: body.opening_float,
    status:        "open",
  }).select().single();
  if (error) {
    // Unique constraint (shifts_one_open_per_register): the pre-check above
    // raced with another open on the same register and lost — same friendly
    // message the pre-check itself would have given.
    if (error.code === "23505") {
      throw Conflict("This register was just opened by someone else. Refresh and pick another register.");
    }
    throw BadRequest(error.message);
  }

  await sb.from("cash_drawer_events").insert({
    workspace_id: body.workspace_id,
    shift_id:     shift.id,
    branch_id:    body.branch_id ?? null,
    type:         "opening_float",
    amount:       body.opening_float,
    reason:       "Shift opened",
  });
  return json({ ok: true, shift });
}

async function handleCloseShift(sb: Sb, body: z.infer<typeof Close>) {
  // expected_float/variance are computed by buildShiftReport — the SAME
  // function list_pending_reconciliation/get_shift_report/the reconciliation
  // detail modal use — instead of a separate cash_drawer_events-type
  // summation. That older summation only counted a `type='sale'` drawer
  // event, which nothing auto-inserts on a real cash payment (cash_event is
  // a manual cashier action), so the stored shifts.variance silently omitted
  // real cash sales in normal operation while buildShiftReport (correctly
  // driven off payment_intents) did not — the same shift could show two
  // different variances depending on which screen you looked at.
  const report = await buildShiftReport(sb, body.shift_id, body.closing_float);

  const { data: shift, error } = await sb.from("shifts").update({
    status:         "closed",
    closed_at:      new Date().toISOString(),
    closing_float:  body.closing_float,
    expected_float: report.expectedCash,
    variance:       report.variance,
  }).eq("id", body.shift_id).select().single();
  if (error) throw BadRequest(error.message);

  // Blind close: expected/variance are computed and stored above, but never
  // returned here — a manager reviews them separately via
  // list_pending_reconciliation / get_shift_report / reconcile_shift.
  // The cashier still gets `receipt` — the same sales/cash breakdown a
  // manager sees, just without the expected-vs-actual math — so they walk
  // away with a printable copy of their own count instead of nothing.
  const { expectedCash: _expectedCash, variance: _variance, ...receipt } = report;

  return json({
    ok: true,
    shift: { id: shift.id, status: shift.status, closed_at: shift.closed_at, closing_float: shift.closing_float },
    receipt,
  });
}

// These four + handleBreakOut return plain data, not a Response — unlike
// every other handler in this file, they're wrapped in an idempotency guard
// by the dispatcher below (see IDEMPOTENT_ACTIONS), which needs the raw
// result to cache for replay. Each unconditionally INSERTs a new event row
// with no natural "already applied" check, so without this a retried
// offline-queued action (see offlineQueue.ts's offline_shift_actions) whose
// original request actually reached the server but lost its response would
// double the clock event or double-count the cash amount instead of safely
// no-opping.
async function handleCashEvent(sb: Sb, body: z.infer<typeof CashEvent>) {
  const { data: evt, error } = await sb.from("cash_drawer_events").insert({
    workspace_id: body.workspace_id,
    shift_id:     body.shift_id ?? null,
    branch_id:    body.branch_id ?? null,
    type:         body.type,
    amount:       body.amount,
    reason:       body.reason ?? null,
    reference_id: body.reference_id ?? null,
  }).select().single();
  if (error) throw BadRequest(error.message);
  return { ok: true, event: evt };
}

// shift_events' actual schema (migration 0046_shift_events_tracking.sql) is
// workspace_id/shift_id/staff_id/event_type/event_timestamp — NOT the
// timestamp/duration/last_clock_in/last_break_in shape these four handlers
// used to assume, which meant every clock/break action failed outright
// ("Could not find the 'timestamp' column of 'shift_events'"). That schema
// also defines an AFTER INSERT trigger (update_shift_status_from_event) that
// already updates shifts.current_status/last_clock_in_at/total_break_minutes
// from the inserted event — the manual `.from("shifts").update(...)` calls
// below were redundant with it AND wrote to columns that don't exist
// (last_clock_in, last_clock_out, last_break_in, last_break_out). Now: insert
// a correctly-shaped event and re-select the shift row the trigger already
// updated, instead of re-deriving its state by hand.
async function insertShiftEvent(
  sb: Sb, workspaceId: string, staffId: string, shiftId: string,
  eventType: "clock_in" | "clock_out" | "break_start" | "break_end",
  eventTimestamp: string,
) {
  const { data: event, error } = await sb.from("shift_events").insert({
    workspace_id: workspaceId, staff_id: staffId, shift_id: shiftId,
    event_type: eventType, event_timestamp: eventTimestamp,
  }).select().single();
  if (error) throw BadRequest(error.message);
  return event;
}

async function fetchShift(sb: Sb, shiftId: string) {
  const { data: shift, error } = await sb.from("shifts").select().eq("id", shiftId).single();
  if (error) throw BadRequest(error.message);
  return shift;
}

async function handleClockIn(sb: Sb, body: z.infer<typeof ClockIn>, workspaceId: string, staffId: string) {
  const now = new Date().toISOString();
  const event = await insertShiftEvent(sb, workspaceId, staffId, body.shift_id, "clock_in", now);
  const shift = await fetchShift(sb, body.shift_id);
  return { ok: true, event, shift };
}

async function handleClockOut(sb: Sb, body: z.infer<typeof ClockOut>, workspaceId: string, staffId: string) {
  const now = new Date().toISOString();
  const event = await insertShiftEvent(sb, workspaceId, staffId, body.shift_id, "clock_out", now);
  const shift = await fetchShift(sb, body.shift_id);
  return { ok: true, event, shift };
}

async function handleBreakIn(sb: Sb, body: z.infer<typeof BreakIn>, workspaceId: string, staffId: string) {
  const now = new Date().toISOString();
  const event = await insertShiftEvent(sb, workspaceId, staffId, body.shift_id, "break_start", now);
  const shift = await fetchShift(sb, body.shift_id);
  return { ok: true, event, shift };
}

async function computeBreakDuration(sb: Sb, shiftId: string, now: string): Promise<number | null> {
  const { data: lastBreakEvent } = await sb.from("shift_events")
    .select("event_timestamp")
    .eq("shift_id", shiftId)
    .eq("event_type", "break_start")
    .order("event_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastBreakEvent) return null;
  const breakInTime = new Date(lastBreakEvent.event_timestamp).getTime();
  const breakOutTime = new Date(now).getTime();
  return Math.round((breakOutTime - breakInTime) / 1000);
}

async function handleBreakOut(sb: Sb, body: z.infer<typeof BreakOut>, workspaceId: string, staffId: string) {
  const now = new Date().toISOString();
  // Computed before the break_end insert below (it looks up the matching
  // break_start) — this instance's duration in seconds, for the API response
  // only. shift_events has no duration column; the trigger already
  // accumulates total_break_minutes on shifts from the two events directly.
  const breakDuration = await computeBreakDuration(sb, body.shift_id, now);
  const event = await insertShiftEvent(sb, workspaceId, staffId, body.shift_id, "break_end", now);
  const shift = await fetchShift(sb, body.shift_id);
  return { ok: true, event, shift, breakDuration };
}

/** Shared by handleGetShiftReport (manager, full data) and handleCloseShift
 * (cashier, expectedCash/variance stripped before returning). */
async function buildShiftReport(sb: Sb, shiftId: string, actualCashOverride?: number) {
  // 1. Fetch shift row
  const { data: shift, error: shiftErr } = await sb
    .from("shifts").select("*, branch_registers(name), branches(name), workspaces(name)").eq("id", shiftId).single();
  if (shiftErr || !shift) throw BadRequest("Shift not found");

  // 2. Fetch all orders for this shift (settled + cancelled — cancelled ones
  // feed the void count/amount below), then settled orders' payment intents —
  // payment_method actually breaks down per-provider on payment_intents (set
  // by payments-cash-confirm), not on the order row itself, and orders is the
  // real table (there is no "pos_orders").
  //
  // "Settled" here is payment_status in (paid, partially_paid) — NOT
  // status === "completed". status tracks kitchen fulfillment (pending until
  // the ticket is served); payment_status tracks money actually collected.
  // payments-cash-confirm intentionally leaves status="pending" on an order
  // whose kitchen ticket isn't served yet even after payment succeeds, so
  // filtering this report on status silently dropped real, already-collected
  // revenue (and the transaction count) for any order still mid-prep at
  // shift-close time — the cashier's shift total read ₱0 despite orders that
  // were genuinely paid.
  const { data: allOrderRows } = await sb
    .from("orders")
    .select("id, total, discount, service_fee, status, payment_status")
    .eq("shift_id", shiftId);
  const settledOrderRows   = (allOrderRows ?? []).filter((o) => o.payment_status === "paid" || o.payment_status === "partially_paid");
  const cancelledOrderRows = (allOrderRows ?? []).filter((o) => o.status === "cancelled");
  const orderIds = settledOrderRows.map((o) => o.id as string);
  const itemCount = orderIds.length;

  const discountTotal    = settledOrderRows.reduce((sum, o) => sum + (Number(o.discount) || 0), 0);
  const serviceFeeTotal  = settledOrderRows.reduce((sum, o) => sum + (Number(o.service_fee) || 0), 0);
  const voidCount        = cancelledOrderRows.length;
  const voidAmount       = cancelledOrderRows.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const paymentBreakdown = { cash: 0, gcash: 0, maya: 0, card: 0, qrph: 0, bank_transfer: 0, other: 0 };
  if (orderIds.length > 0) {
    const { data: intents } = await sb
      .from("payment_intents")
      .select("amount, provider")
      .in("order_id", orderIds)
      .eq("status", "succeeded");
    for (const intent of intents ?? []) {
      const amt = Number(intent.amount);
      const key = (intent.provider as string) in paymentBreakdown ? (intent.provider as keyof typeof paymentBreakdown) : "other";
      paymentBreakdown[key] += amt;
    }
  }
  const cashSales   = paymentBreakdown.cash;
  const onlineSales = paymentBreakdown.gcash + paymentBreakdown.maya + paymentBreakdown.card
    + paymentBreakdown.qrph + paymentBreakdown.bank_transfer + paymentBreakdown.other;
  const totalSales  = cashSales + onlineSales;

  // 3. Fetch top 5 products across settled orders for this shift — real
  // tables are order_items (columns: product_id, quantity) and products
  // (name); there is no "pos_order_items" and order_items has no name/qty
  // columns of its own.
  const productMap: Record<string, number> = {};
  if (orderIds.length > 0) {
    const { data: itemRows } = await sb
      .from("order_items")
      .select("id, quantity, order_id, products(name)")
      .in("order_id", orderIds);
    for (const row of itemRows ?? []) {
      const key = (row.products as { name: string } | null)?.name ?? "Unknown";
      productMap[key] = (productMap[key] ?? 0) + Number(row.quantity);
    }

    // Add-ons (order_item_addons) are separate line items, snapshotted with
    // their own name/qty at order time — without this, an order that's e.g.
    // pure add-ons on a base item, or whose add-ons are the actual bestseller,
    // silently never appears in the top-products breakdown even though it's
    // fully counted in totalSales.
    const itemIds = (itemRows ?? []).map((r) => r.id as string);
    if (itemIds.length > 0) {
      const { data: addonRows } = await sb
        .from("order_item_addons")
        .select("name, qty")
        .in("order_item_id", itemIds);
      for (const row of addonRows ?? []) {
        const key = `${row.name} (add-on)`;
        productMap[key] = (productMap[key] ?? 0) + Number(row.qty);
      }
    }
  }
  const topProducts = Object.entries(productMap)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // 4. Fetch manual cash drawer adjustments (Cash In / Cash Out / Refund) for this shift
  const { data: drawerEvents } = await sb
    .from("cash_drawer_events")
    .select("type, amount")
    .eq("shift_id", shiftId);

  let cashIn = 0, cashOut = 0, refunds = 0, refundCount = 0;
  for (const e of drawerEvents ?? []) {
    if (e.type === "cash_in")  cashIn  += Number(e.amount);
    if (e.type === "cash_out") cashOut += Number(e.amount);
    if (e.type === "refund")   { refunds += Number(e.amount); refundCount++; }
  }

  const openFloat    = Number(shift.opening_float ?? 0);
  const actualCash   = actualCashOverride ?? Number(shift.closing_float ?? 0);
  const expectedCash = openFloat + cashSales + cashIn - cashOut - refunds;
  const variance     = actualCash - expectedCash;

  return {
    shiftId:      shift.id,
    cashierName:  shift.cashier_name,
    // Previously never returned — every shift/reconciliation report printed
    // client-side fell back to the generic "FINDXNY" default instead of the
    // real workspace name (see generateShiftReport.ts's businessName fallback).
    businessName: shift.workspaces?.name ?? null,
    branchName:   shift.branches?.name ?? null,
    registerName: shift.branch_registers?.name ?? null,
    reconciledAt: shift.reconciled_at,
    openedAt:     shift.opened_at ?? shift.created_at,
    closedAt:     shift.closed_at ?? new Date().toISOString(),
    openFloat,
    cashSales,
    onlineSales,
    totalSales,
    paymentBreakdown,
    itemCount,
    topProducts,
    discountTotal,
    serviceFeeTotal,
    voidCount,
    voidAmount,
    refundCount,
    refundAmount: refunds,
    cashIn,
    cashOut,
    expectedCash,
    actualCash,
    variance,
  };
}

async function handleGetShiftReport(sb: Sb, body: z.infer<typeof ShiftReport>) {
  const report = await buildShiftReport(sb, body.shift_id, body.actual_cash);
  return json({ ok: true, ...report });
}

async function handleListPendingReconciliation(sb: Sb, body: z.infer<typeof ListPendingReconciliation>) {
  let q = sb.from("shifts")
    .select("id, cashier_name, branch_id, register_id, opened_at, closed_at, opening_float, closing_float, expected_float, variance, branch_registers(name), branches(name)")
    .eq("workspace_id", body.workspace_id)
    .eq("status", "closed")
    .is("reconciled_at", null)
    .order("closed_at", { ascending: false });
  if (body.branch_id) q = q.eq("branch_id", body.branch_id);
  const { data, error } = await q;
  if (error) throw BadRequest(error.message);

  const shiftIds = (data ?? []).map((s: any) => s.id);
  const countByShift = new Map<string, number>();
  if (shiftIds.length > 0) {
    // Same payment_status filter as buildShiftReport (not status="completed")
    // — a shift's transactionCount here must match the count buildShiftReport
    // derives for the same shift, or the reconciliation list and the detail
    // view disagree on how many transactions a shift actually had.
    const { data: orderRows } = await sb.from("orders")
      .select("shift_id")
      .in("shift_id", shiftIds)
      .in("payment_status", ["paid", "partially_paid"]);
    for (const row of (orderRows ?? []) as any[]) {
      const sid = row.shift_id as string;
      countByShift.set(sid, (countByShift.get(sid) ?? 0) + 1);
    }
  }

  return json({
    ok: true,
    shifts: (data ?? []).map((s: any) => ({
      id:            s.id,
      cashierName:   s.cashier_name,
      registerName:  s.branch_registers?.name ?? null,
      branchName:    s.branches?.name ?? null,
      openedAt:      s.opened_at,
      closedAt:      s.closed_at,
      openingFloat:  Number(s.opening_float ?? 0),
      closingFloat:  s.closing_float !== null ? Number(s.closing_float) : null,
      expectedFloat: s.expected_float !== null ? Number(s.expected_float) : null,
      variance:      s.variance !== null ? Number(s.variance) : null,
      transactionCount: countByShift.get(s.id) ?? 0,
    })),
  });
}

async function handleReconcileShift(sb: Sb, body: z.infer<typeof ReconcileShift>, actorId: string) {
  const { data: shift, error } = await sb.from("shifts")
    .update({ reconciled_at: new Date().toISOString(), reconciled_by: actorId })
    .eq("id", body.shift_id)
    .eq("workspace_id", body.workspace_id)
    .eq("status", "closed")
    .select()
    .single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId: body.workspace_id, actorId,
    action: "shift.reconciled", entityType: "shift", entityId: body.shift_id,
    after: { variance: shift.variance, notes: body.notes ?? null },
  }));

  return json({ ok: true, shift });
}

async function handleGetSummary(sb: Sb, body: z.infer<typeof Summary>) {
  const { data: shift } = await sb.from("shifts").select("*").eq("id", body.shift_id).single();
  const { data: events } = await sb.from("cash_drawer_events")
    .select("*").eq("shift_id", body.shift_id).order("created_at", { ascending: true });
  let cashSales = 0, cashIn = 0, cashOut = 0, refunds = 0;
  for (const e of events ?? []) {
    if (e.type === "sale")     cashSales += Number(e.amount);
    if (e.type === "cash_in")  cashIn    += Number(e.amount);
    if (e.type === "cash_out") cashOut   += Number(e.amount);
    if (e.type === "refund")   refunds   += Number(e.amount);
  }
  const openingFloat = shift?.opening_float ?? 0;
  const expectedDrawer = openingFloat + cashSales + cashIn - cashOut - refunds;
  return json({
    ok: true, shift, events,
    summary: { openingFloat, cashSales, cashIn, cashOut, refunds, expectedDrawer },
  });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const sb = adminClient();

    const wsId = await resolveWorkspaceId(sb, body);
    const ctx = await requireAuth(req, wsId);
    // Manual cash drawer adjustments and anything that reveals expected-vs-
    // actual drawer math require manager+ — everything else (open/close
    // shift, clock in/out, break, listing registers) stays available to any
    // staff member running their own shift.
    requireRole(ctx, MANAGER_ONLY_ACTIONS.has(body.action) ? Roles.VOID_REFUND : Roles.STAFF_WRITE);

    if (body.action === "open_shift")      return await handleOpenShift(sb, body, ctx.userId);
    if (body.action === "close_shift")     return await handleCloseShift(sb, body);
    if (body.action === "get_shift_report") return await handleGetShiftReport(sb, body);
    if (body.action === "list_registers")  return await handleListRegisters(sb, body);
    if (body.action === "list_pending_reconciliation") return await handleListPendingReconciliation(sb, body);
    if (body.action === "reconcile_shift") return await handleReconcileShift(sb, body, ctx.userId);
    if (body.action !== "cash_event" && body.action !== "clock_in" && body.action !== "clock_out"
      && body.action !== "break_in" && body.action !== "break_out") {
      return await handleGetSummary(sb, body);
    }

    // Only these five unconditionally INSERT a new row with no natural
    // "already applied" check (see the comment above handleCashEvent) — a
    // retried offline-queued action (offlineQueue.ts's offline_shift_actions)
    // whose original request actually reached the server but lost its
    // response needs this to come back as a safe replay instead of a
    // duplicate clock event or double-counted cash amount.
    idem = await idempotencyGuard(req, "pos-shift", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);

    let result: Record<string, unknown>;
    if (body.action === "cash_event")      result = await handleCashEvent(sb, body);
    else if (body.action === "clock_in")   result = await handleClockIn(sb, body, wsId, ctx.userId);
    else if (body.action === "clock_out")  result = await handleClockOut(sb, body, wsId, ctx.userId);
    else if (body.action === "break_in")   result = await handleBreakIn(sb, body, wsId, ctx.userId);
    else                                    result = await handleBreakOut(sb, body, wsId, ctx.userId);

    await idem.commit(200, result);
    return json(result, 200);
  } catch (err) {
    if (idem) await idem.release().catch(() => {});
    return handleError(err);
  }
});
