// POST /reports-extended — analytics reports not covered by pos-data.
//
// Body: { workspace_id: UUID, resource: string, from_date: YYYY-MM-DD,
//         to_date: YYYY-MM-DD, branch_id?: UUID }
//
// Resources:
//   bookings-analytics  — booking funnel + revenue by resource/day
//   staff-performance   — orders, sales, discounts per cashier
//   shift-history        — per-shift payment breakdown, per-cashier-name
//                           roll-up, and daily shortage/overage trend
//   discounts-refunds   — discount breakdown + voucher leaderboard + refunds
//   customer-ltv        — repeat rate, avg LTV, top-50 customers
//   period-comparison   — current vs previous equal-length period
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { phStartOfDay } from "../_shared/dates.ts";

// ─── Request schema ───────────────────────────────────────────────────────────

const Body = z.object({
  workspace_id: z.string().uuid(),
  resource: z.enum([
    "bookings-analytics",
    "staff-performance",
    "shift-history",
    "discounts-refunds",
    "customer-ltv",
    "period-comparison",
  ]),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from_date must be YYYY-MM-DD"),
  to_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to_date must be YYYY-MM-DD"),
  branch_id: z.string().uuid().optional(),
});

type AdminClient = ReturnType<typeof adminClient>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Inclusive start-of-day ISO string for a YYYY-MM-DD date, in Asia/Manila
 *  (matches every other surface — Dashboard, Reports, shift/Z-reports —
 *  instead of forcing a UTC boundary 8 hours off from PH midnight). */
function dayStart(date: string): string {
  return phStartOfDay(date).toISOString();
}

/** Exclusive start-of-day ISO string for the day AFTER a YYYY-MM-DD date, in Asia/Manila. */
function dayAfter(date: string): string {
  return phStartOfDay(shiftDate(date, 1)).toISOString();
}

/** Shift a YYYY-MM-DD date by N days. N can be negative. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Number of calendar days in [from, to] inclusive. */
function periodLengthDays(from: string, to: string): number {
  const msPerDay = 86_400_000;
  return Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
      msPerDay,
  ) + 1;
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100; // 2 decimal places
}

function safePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

// ─── 1. bookings-analytics ────────────────────────────────────────────────────

async function bookingsAnalytics(
  admin: AdminClient,
  wsId: string,
  fromDate: string,
  toDate: string,
  branchId?: string,
): Promise<Response> {
  let q = admin
    .from("bookings")
    .select(
      "id,status,payment_status,total,resource_id,start_time,bookable_resources(name,type)",
    )
    .eq("workspace_id", wsId)
    .gte("start_time", dayStart(fromDate))
    .lt("start_time", dayAfter(toDate))
    .limit(5000);
  if (branchId) q = q.eq("branch_id", branchId);

  const { data, error } = await q;
  if (error) throw BadRequest(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    payment_status: string;
    total: number | null;
    resource_id: string | null;
    start_time: string;
    bookable_resources: { name: string; type: string } | null;
  }>;

  const confirmedStatuses = new Set(["confirmed", "checked_in", "checked_out", "completed"]);
  let confirmed = 0, cancelled = 0, noShow = 0, totalRevenue = 0, revenueCount = 0;

  const byResource = new Map<string, { name: string; type: string; bookings: number; revenue: number }>();
  const byDay = new Map<string, { bookings: number; revenue: number }>();

  for (const row of rows) {
    if (confirmedStatuses.has(row.status)) confirmed++;
    else if (row.status === "cancelled") cancelled++;
    else if (row.status === "no_show") noShow++;

    const isPaid = row.payment_status === "paid" || row.payment_status === "partial";
    const rowRevenue = isPaid ? (Number(row.total) || 0) : 0;
    if (isPaid) { totalRevenue += rowRevenue; revenueCount++; }

    // by_resource
    const resKey = row.resource_id ?? "__none__";
    if (!byResource.has(resKey)) {
      byResource.set(resKey, {
        name: row.bookable_resources?.name ?? "Unknown",
        type: row.bookable_resources?.type ?? "unknown",
        bookings: 0,
        revenue: 0,
      });
    }
    const res = byResource.get(resKey)!;
    res.bookings++;
    res.revenue += rowRevenue;

    // by_day — key is the date portion of start_time
    const dayKey = row.start_time.slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, { bookings: 0, revenue: 0 });
    const day = byDay.get(dayKey)!;
    day.bookings++;
    day.revenue += rowRevenue;
  }

  const total = rows.length;
  return json({
    total_bookings: total,
    confirmed,
    cancelled,
    no_show: noShow,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    avg_booking_value: revenueCount ? Math.round((totalRevenue / revenueCount) * 100) / 100 : 0,
    cancellation_rate: pct(cancelled, total),
    no_show_rate: pct(noShow, total),
    by_resource: [...byResource.values()].sort((a, b) => b.bookings - a.bookings),
    by_day: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
  });
}

// ─── 2. staff-performance ─────────────────────────────────────────────────────

async function staffPerformance(
  admin: AdminClient,
  wsId: string,
  fromDate: string,
  toDate: string,
  branchId?: string,
): Promise<Response> {
  let q = admin
    .from("orders")
    .select("cashier_id,total,status,payment_status,discount")
    .eq("workspace_id", wsId)
    .gte("created_at", dayStart(fromDate))
    .lt("created_at", dayAfter(toDate))
    .limit(10000);
  if (branchId) q = q.eq("branch_id", branchId);

  const { data, error } = await q;
  if (error) throw BadRequest(error.message);
  const rows = (data ?? []) as Array<{
    cashier_id: string | null;
    total: number | null;
    status: string;
    payment_status: string | null;
    discount: number | null;
  }>;

  const staffMap = new Map<
    string,
    {
      cashier_id: string | null;
      orders: number;
      gross_sales: number;
      net_sales: number;
      cancellations: number;
      discounts_given: number;
    }
  >();

  for (const row of rows) {
    const key = row.cashier_id ?? "__none__";
    if (!staffMap.has(key)) {
      staffMap.set(key, {
        cashier_id: row.cashier_id,
        orders: 0,
        gross_sales: 0,
        net_sales: 0,
        cancellations: 0,
        discounts_given: 0,
      });
    }
    const s = staffMap.get(key)!;
    s.orders++;
    // A fully-refunded order still counts toward this cashier's order count
    // but is dropped from both sales totals — same exclusion
    // dashboard-gross-sales/reportsOrdersMain already apply.
    const refunded = row.payment_status === "refunded";
    if (!refunded) s.gross_sales += Number(row.total) || 0;
    if (row.status === "completed" && !refunded) s.net_sales += Number(row.total) || 0;
    if (row.status === "cancelled") s.cancellations++;
    s.discounts_given += Number(row.discount) || 0;
  }

  // Resolve names from workspace_members joined to profiles
  const cashierIds = [...staffMap.keys()].filter((k) => k !== "__none__");
  const nameById: Record<string, string> = {};
  const currentMemberIds = new Set<string>();
  if (cashierIds.length > 0) {
    const { data: members } = await admin
      .from("workspace_members")
      .select("user_id,profiles(full_name,username)")
      .eq("workspace_id", wsId)
      .in("user_id", cashierIds);
    for (const m of (members ?? []) as Array<{ user_id: string; profiles: { full_name?: string; username?: string } | null }>) {
      currentMemberIds.add(m.user_id);
      const prof = m.profiles;
      const name = prof?.full_name ?? prof?.username ?? null;
      if (name) nameById[m.user_id] = name;
    }
    // A cashier can have historical orders after their workspace_members row
    // is gone (removed staff) — fall back to profiles directly rather than
    // leaking the raw UUID into the report.
    const unresolved = cashierIds.filter((id) => !nameById[id]);
    if (unresolved.length > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id,full_name,username")
        .in("id", unresolved);
      for (const p of (profs ?? []) as Array<{ id: string; full_name?: string; username?: string }>) {
        const name = p.full_name ?? p.username ?? null;
        if (name) nameById[p.id] = name;
      }
    }
    // Still unresolved: a real account (e.g. owner) that never set a display
    // name — that's not "removed", so fall back to their login email (every
    // account has one) rather than mislabeling an active member as former staff.
    const stillUnresolved = cashierIds.filter((id) => !nameById[id] && currentMemberIds.has(id));
    for (const id of stillUnresolved) {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) nameById[id] = data.user.email;
    }
  }

  const staff = [...staffMap.values()].map((s) => ({
    cashier_id: s.cashier_id,
    name: s.cashier_id
      ? (nameById[s.cashier_id] ?? (currentMemberIds.has(s.cashier_id) ? "Unnamed Staff" : "Former Staff"))
      : "Unassigned",
    orders: s.orders,
    gross_sales: Math.round(s.gross_sales * 100) / 100,
    net_sales: Math.round(s.net_sales * 100) / 100,
    cancellations: s.cancellations,
    discounts_given: Math.round(s.discounts_given * 100) / 100,
    avg_order_value: s.orders ? Math.round((s.gross_sales / s.orders) * 100) / 100 : 0,
  }));

  staff.sort((a, b) => b.gross_sales - a.gross_sales);
  return json({ staff });
}

// ─── 2b. shift-history ────────────────────────────────────────────────────────
// Per-shift breakdown (not per-order): every cashier's shift with its own
// payment-method split, a roll-up by the free-text name typed at shift-open
// (not the login account — a shared device can have different people type
// their name each shift), and a day-by-day shortage/overage trend so
// "how much shortage this week/month" can be read off the existing
// Today/7-day/30-day/Custom period picker instead of a separate control.

const SHIFT_PAYMENT_KEYS = ["cash", "gcash", "maya", "card", "qrph", "bank_transfer", "other"] as const;
type ShiftPaymentBreakdown = Record<typeof SHIFT_PAYMENT_KEYS[number], number>;
function emptyBreakdown(): ShiftPaymentBreakdown {
  return { cash: 0, gcash: 0, maya: 0, card: 0, qrph: 0, bank_transfer: 0, other: 0 };
}

/** YYYY-MM-DD calendar day of an ISO timestamp in Asia/Manila (UTC+8). */
function phDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function shiftHistory(
  admin: AdminClient,
  wsId: string,
  fromDate: string,
  toDate: string,
  branchId?: string,
): Promise<Response> {
  let q = admin
    .from("shifts")
    .select("id,cashier_name,branch_id,register_id,status,opened_at,closed_at,opening_float,closing_float,expected_float,variance,reconciled_at,branch_registers(name),branches(name)")
    .eq("workspace_id", wsId)
    .gte("opened_at", dayStart(fromDate))
    .lt("opened_at", dayAfter(toDate))
    .order("opened_at", { ascending: false })
    .limit(2000);
  if (branchId) q = q.eq("branch_id", branchId);

  const { data, error } = await q;
  if (error) throw BadRequest(error.message);
  const shifts = (data ?? []) as any[];
  const shiftIds = shifts.map((s) => s.id as string);

  // Settled orders per shift → order_id-to-shift_id map, since
  // payment_intents only carries order_id, not shift_id.
  //
  // Filtered on payment_status (paid/partially_paid), NOT status="completed"
  // — same distinction buildShiftReport (pos-shift/index.ts) draws: status
  // tracks kitchen fulfillment and can still be pending/preparing on an
  // order that's already been paid in full. Filtering on status here made
  // this view under-count relative to buildShiftReport's own numbers for
  // the exact same shift whenever an order was still mid-prep at shift-close.
  const orderToShift = new Map<string, string>();
  const txCountByShift = new Map<string, number>();
  if (shiftIds.length > 0) {
    const { data: orderRows } = await admin
      .from("orders")
      .select("id,shift_id,payment_status")
      .in("shift_id", shiftIds)
      .in("payment_status", ["paid", "partially_paid"]);
    for (const row of (orderRows ?? []) as Array<{ id: string; shift_id: string; payment_status: string }>) {
      orderToShift.set(row.id, row.shift_id);
      txCountByShift.set(row.shift_id, (txCountByShift.get(row.shift_id) ?? 0) + 1);
    }
  }

  const breakdownByShift = new Map<string, ShiftPaymentBreakdown>();
  const orderIds = [...orderToShift.keys()];
  if (orderIds.length > 0) {
    const { data: intents } = await admin
      .from("payment_intents")
      .select("amount,provider,order_id")
      .in("order_id", orderIds)
      .eq("status", "succeeded");
    for (const intent of (intents ?? []) as Array<{ amount: number; provider: string; order_id: string }>) {
      const shiftId = orderToShift.get(intent.order_id);
      if (!shiftId) continue;
      if (!breakdownByShift.has(shiftId)) breakdownByShift.set(shiftId, emptyBreakdown());
      const bd = breakdownByShift.get(shiftId)!;
      const key = (SHIFT_PAYMENT_KEYS as readonly string[]).includes(intent.provider)
        ? (intent.provider as keyof ShiftPaymentBreakdown) : "other";
      bd[key] += Number(intent.amount) || 0;
    }
  }

  const rows = shifts.map((s) => {
    const bd = breakdownByShift.get(s.id) ?? emptyBreakdown();
    const totalSales = SHIFT_PAYMENT_KEYS.reduce((sum, k) => sum + bd[k], 0);
    return {
      id: s.id,
      cashierName: (s.cashier_name as string | null)?.trim() || "—",
      registerName: s.branch_registers?.name ?? null,
      branchName: s.branches?.name ?? null,
      status: s.status,
      openedAt: s.opened_at,
      closedAt: s.closed_at,
      openingFloat: Number(s.opening_float ?? 0),
      closingFloat: s.closing_float !== null ? Number(s.closing_float) : null,
      expectedFloat: s.expected_float !== null ? Number(s.expected_float) : null,
      variance: s.variance !== null ? Number(s.variance) : null,
      reconciledAt: s.reconciled_at,
      transactionCount: txCountByShift.get(s.id) ?? 0,
      paymentBreakdown: bd,
      totalSales: Math.round(totalSales * 100) / 100,
    };
  });

  // Roll-up by the cashier-typed name — grouped case-insensitively so
  // "Maria" and "maria " match, displayed using the first-seen casing.
  const summaryMap = new Map<string, {
    cashierName: string; shiftCount: number; totalSales: number;
    paymentBreakdown: ShiftPaymentBreakdown; shortageTotal: number; overageTotal: number;
  }>();
  for (const r of rows) {
    const key = r.cashierName.toLowerCase();
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        cashierName: r.cashierName, shiftCount: 0, totalSales: 0,
        paymentBreakdown: emptyBreakdown(), shortageTotal: 0, overageTotal: 0,
      });
    }
    const sum = summaryMap.get(key)!;
    sum.shiftCount += 1;
    sum.totalSales += r.totalSales;
    for (const k of SHIFT_PAYMENT_KEYS) sum.paymentBreakdown[k] += r.paymentBreakdown[k];
    if (r.variance !== null) {
      if (r.variance < 0) sum.shortageTotal += -r.variance;
      else sum.overageTotal += r.variance;
    }
  }
  const summaryByCashier = [...summaryMap.values()]
    .map((s) => ({
      ...s,
      totalSales: Math.round(s.totalSales * 100) / 100,
      shortageTotal: Math.round(s.shortageTotal * 100) / 100,
      overageTotal: Math.round(s.overageTotal * 100) / 100,
    }))
    .sort((a, b) => b.totalSales - a.totalSales);

  // Day-by-day shortage/overage trend (Asia/Manila calendar day of closed_at).
  const shortageByDayMap = new Map<string, { shortageTotal: number; overageTotal: number }>();
  for (const r of rows) {
    if (r.variance === null || !r.closedAt) continue;
    const day = phDayKey(r.closedAt);
    if (!shortageByDayMap.has(day)) shortageByDayMap.set(day, { shortageTotal: 0, overageTotal: 0 });
    const d = shortageByDayMap.get(day)!;
    if (r.variance < 0) d.shortageTotal += -r.variance;
    else d.overageTotal += r.variance;
  }
  const shortageByDay = [...shortageByDayMap.entries()]
    .map(([date, v]) => ({
      date,
      shortageTotal: Math.round(v.shortageTotal * 100) / 100,
      overageTotal: Math.round(v.overageTotal * 100) / 100,
      netVariance: Math.round((v.overageTotal - v.shortageTotal) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return json({ shifts: rows, summaryByCashier, shortageByDay });
}

// ─── 3. discounts-refunds ─────────────────────────────────────────────────────

async function discountsRefunds(
  admin: AdminClient,
  wsId: string,
  fromDate: string,
  toDate: string,
  branchId?: string,
): Promise<Response> {
  let oq = admin
    .from("orders")
    .select("total,discount,discount_source,is_senior_pwd,voucher_code")
    .eq("workspace_id", wsId)
    .gte("created_at", dayStart(fromDate))
    .lt("created_at", dayAfter(toDate))
    .limit(10000);
  if (branchId) oq = oq.eq("branch_id", branchId);

  // Order refunds (refunds-create) write to `transactions`, not
  // booking_payment_transactions — this used to only read the latter, so a
  // real order refund never showed up here even though the discounts above
  // are order-scoped too. Matches reports-refund-total's source exactly.
  let rq = admin
    .from("transactions")
    .select("amount")
    .eq("workspace_id", wsId)
    .eq("type", "refund")
    .eq("status", "completed")
    .gte("created_at", dayStart(fromDate))
    .lt("created_at", dayAfter(toDate))
    .limit(5000);
  if (branchId) rq = rq.eq("branch_id", branchId);

  const [ordersRes, refundsRes] = await Promise.all([oq, rq]);
  if (ordersRes.error) throw BadRequest(ordersRes.error.message);

  const orders = (ordersRes.data ?? []) as Array<{
    total: number | null;
    discount: number | null;
    discount_source: string | null;
    is_senior_pwd: boolean | null;
    voucher_code: string | null;
  }>;

  let totalDiscount = 0;
  let manualDiscount = 0;
  let seniorPwdDiscount = 0;
  let voucherDiscount = 0;
  let totalGross = 0;

  const voucherMap = new Map<string, { uses: number; total_discounted: number }>();

  for (const o of orders) {
    const disc = Number(o.discount) || 0;
    const gross = Number(o.total) || 0;
    totalDiscount += disc;
    totalGross += gross;

    if (o.discount_source === "manual") manualDiscount += disc;
    if (o.is_senior_pwd) seniorPwdDiscount += disc;
    if (o.discount_source === "voucher") voucherDiscount += disc;

    if (o.voucher_code && disc > 0) {
      const entry = voucherMap.get(o.voucher_code) ?? { uses: 0, total_discounted: 0 };
      entry.uses++;
      entry.total_discounted += disc;
      voucherMap.set(o.voucher_code, entry);
    }
  }

  const topVouchers = [...voucherMap.entries()]
    .map(([code, v]) => ({
      code,
      uses: v.uses,
      total_discounted: Math.round(v.total_discounted * 100) / 100,
    }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 10);

  const refunds = (refundsRes.data ?? []) as Array<{ amount: number | null }>;
  // transactions.amount is stored negative for a refund leg — abs() it,
  // same as reportsHelpers.ts' buildRefundTotal on the Reports Overview tab.
  const totalRefunds = refunds.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);

  return json({
    total_discount: Math.round(totalDiscount * 100) / 100,
    manual_discount: Math.round(manualDiscount * 100) / 100,
    senior_pwd_discount: Math.round(seniorPwdDiscount * 100) / 100,
    voucher_discount: Math.round(voucherDiscount * 100) / 100,
    // discount_rate as % of pre-discount gross (gross already includes the discount amount)
    discount_rate: pct(totalDiscount, totalGross + totalDiscount),
    total_refunds: Math.round(totalRefunds * 100) / 100,
    refund_count: refunds.length,
    top_vouchers: topVouchers,
  });
}

// ─── 4. customer-ltv ─────────────────────────────────────────────────────────

async function customerLtv(
  admin: AdminClient,
  wsId: string,
  fromDate: string,
  toDate: string,
  branchId?: string,
): Promise<Response> {
  const { count: totalCustomers } = await admin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", wsId);

  let oq = admin
    .from("orders")
    .select("customer_id,total,created_at")
    .eq("workspace_id", wsId)
    .eq("status", "completed")
    .neq("payment_status", "refunded")
    .not("customer_id", "is", null)
    .gte("created_at", dayStart(fromDate))
    .lt("created_at", dayAfter(toDate))
    .limit(20000);
  if (branchId) oq = oq.eq("branch_id", branchId);

  const { data: orderRows, error: oErr } = await oq;
  if (oErr) throw BadRequest(oErr.message);
  const orders = (orderRows ?? []) as Array<{
    customer_id: string;
    total: number | null;
    created_at: string;
  }>;

  const custMap = new Map<string, { orders: number; total_spend: number; last_order_at: string }>();
  for (const o of orders) {
    const k = o.customer_id;
    const existing = custMap.get(k) ?? { orders: 0, total_spend: 0, last_order_at: o.created_at };
    existing.orders++;
    existing.total_spend += Number(o.total) || 0;
    if (o.created_at > existing.last_order_at) existing.last_order_at = o.created_at;
    custMap.set(k, existing);
  }

  const repeatCustomers = [...custMap.values()].filter((c) => c.orders >= 2).length;
  const totalSpend = [...custMap.values()].reduce((s, c) => s + c.total_spend, 0);
  const avgLtv = custMap.size ? Math.round((totalSpend / custMap.size) * 100) / 100 : 0;

  // Top 50 by spend — then fetch their profile details
  const topIds = [...custMap.entries()]
    .sort((a, b) => b[1].total_spend - a[1].total_spend)
    .slice(0, 50)
    .map(([id]) => id);

  let topCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    orders: number;
    total_spend: number;
    loyalty_points: number;
    last_order_at: string;
  }> = [];

  if (topIds.length > 0) {
    const { data: custRows } = await admin
      .from("customers")
      .select("id,name,phone,points_balance")
      .in("id", topIds);
    const custDetail = new Map<string, { name: string; phone: string; points_balance: number }>(
      ((custRows ?? []) as Array<{ id: string; name: string | null; phone: string | null; points_balance: number | null }>).map(
        (c) => [c.id, { name: c.name ?? "", phone: c.phone ?? "", points_balance: Number(c.points_balance) || 0 }],
      ),
    );
    topCustomers = topIds.map((id) => {
      const agg = custMap.get(id)!;
      const detail = custDetail.get(id) ?? { name: id, phone: "", points_balance: 0 };
      return {
        id,
        name: detail.name,
        phone: detail.phone,
        orders: agg.orders,
        total_spend: Math.round(agg.total_spend * 100) / 100,
        loyalty_points: detail.points_balance,
        last_order_at: agg.last_order_at,
      };
    });
  }

  return json({
    total_customers: totalCustomers ?? 0,
    repeat_customers: repeatCustomers,
    repeat_rate: pct(repeatCustomers, custMap.size || 1),
    avg_ltv: avgLtv,
    top_customers: topCustomers,
  });
}

// ─── 5. period-comparison ─────────────────────────────────────────────────────

async function fetchPeriodMetrics(
  admin: AdminClient,
  wsId: string,
  fromDate: string,
  toDate: string,
  branchId?: string,
): Promise<{ gross: number; net: number; orders: number; aov: number; bookings_revenue: number }> {
  let oq = admin
    .from("orders")
    .select("total,status,payment_status")
    .eq("workspace_id", wsId)
    .gte("created_at", dayStart(fromDate))
    .lt("created_at", dayAfter(toDate))
    .limit(10000);
  if (branchId) oq = oq.eq("branch_id", branchId);

  let bq = admin
    .from("bookings")
    .select("total,payment_status")
    .eq("workspace_id", wsId)
    .gte("start_time", dayStart(fromDate))
    .lt("start_time", dayAfter(toDate))
    .in("payment_status", ["paid", "partial"])
    .limit(5000);
  if (branchId) bq = bq.eq("branch_id", branchId);

  const [ordersRes, bookingsRes] = await Promise.all([oq, bq]);

  const orders = (ordersRes.data ?? []) as Array<{ total: number | null; status: string; payment_status: string | null }>;
  const bookings = (bookingsRes.data ?? []) as Array<{ total: number | null; payment_status: string }>;

  let gross = 0, net = 0;
  for (const o of orders) {
    // Same refunded-order exclusion as every other gross/net figure in this app.
    if (o.payment_status === "refunded") continue;
    gross += Number(o.total) || 0;
    if (o.status === "completed") net += Number(o.total) || 0;
  }
  const bookingsRevenue = bookings.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const orderCount = orders.length;

  return {
    gross: Math.round(gross * 100) / 100,
    net: Math.round(net * 100) / 100,
    orders: orderCount,
    aov: orderCount ? Math.round((gross / orderCount) * 100) / 100 : 0,
    bookings_revenue: Math.round(bookingsRevenue * 100) / 100,
  };
}

async function periodComparison(
  admin: AdminClient,
  wsId: string,
  fromDate: string,
  toDate: string,
  branchId?: string,
): Promise<Response> {
  const days = periodLengthDays(fromDate, toDate);
  const prevTo = shiftDate(fromDate, -1);          // day before current period start
  const prevFrom = shiftDate(prevTo, -(days - 1)); // equal-length window before that

  const [current, previous] = await Promise.all([
    fetchPeriodMetrics(admin, wsId, fromDate, toDate, branchId),
    fetchPeriodMetrics(admin, wsId, prevFrom, prevTo, branchId),
  ]);

  return json({
    current,
    previous,
    previous_period: { from_date: prevFrom, to_date: prevTo },
    change: {
      gross_pct:  safePct(current.gross,  previous.gross),
      net_pct:    safePct(current.net,    previous.net),
      orders_pct: safePct(current.orders, previous.orders),
      aov_pct:    safePct(current.aov,    previous.aov),
    },
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    const { workspace_id: wsId, resource, from_date, to_date, branch_id } = body;

    switch (resource) {
      case "bookings-analytics":
        return await bookingsAnalytics(admin, wsId, from_date, to_date, branch_id);
      case "staff-performance":
        return await staffPerformance(admin, wsId, from_date, to_date, branch_id);
      case "shift-history":
        return await shiftHistory(admin, wsId, from_date, to_date, branch_id);
      case "discounts-refunds":
        return await discountsRefunds(admin, wsId, from_date, to_date, branch_id);
      case "customer-ltv":
        return await customerLtv(admin, wsId, from_date, to_date, branch_id);
      case "period-comparison":
        return await periodComparison(admin, wsId, from_date, to_date, branch_id);
      default:
        throw BadRequest(`Unknown resource: ${resource}`);
    }
  } catch (err) {
    return handleError(err);
  }
});
