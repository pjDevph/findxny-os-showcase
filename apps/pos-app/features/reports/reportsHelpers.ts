import { peso as canonicalPeso } from "../order/format";
import { phDateStr, phEndOfDayIso, phStartOfDayIso } from "../utils/phDate";
import {
  DD_OPTION_LABELS,
  type ChannelRow, type CategoryRow, type DailyPoint, type OrderRow, type PaymentBar, type Period, type ProductRow,
  type RawChannelBreakdownRow, type RawOrderMainRow, type RawPaymentBreakdownRow, type RawProductRankingRow, type RawRefundTotalRow,
  type ReportsData, type SectionRes,
} from "./types";

/** Thousands-separated peso — matches the canonical formatter (features/order/format.ts)
 *  with `{ grouped: true }`, so reports/summary screens show "₱12,345.00" instead of
 *  the plain "₱12345.00" used on receipts/cart totals. */
export const peso = (n: number) => canonicalPeso(Number(n), { grouped: true });

export const shortNo = (n: string) =>
  `#${(/\d+/.exec(n) ?? [n])[0].slice(-4).padStart(4, "0")}`;

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

export const pct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "0%";

export function sinceDate(days: number): string {
  return phStartOfDayIso(phDateStr(days === 1 ? 0 : -days));
}

/** Inclusive upper bound (Asia/Manila end-of-day) for a "Custom" range's `to` date. */
export function untilDate(customTo: string): string {
  return phEndOfDayIso(customTo);
}

/** Returns YYYY-MM-DD for a date offset by `days` from today (0 = today), in Asia/Manila. */
export function isoDate(offsetDays = 0): string {
  return phDateStr(offsetDays);
}

/** Given a Period or custom range, return { fromDate, toDate } as YYYY-MM-DD strings. */
export function periodDates(period: Period, customFrom: string, customTo: string, useCustom: boolean): { fromDate: string; toDate: string } {
  const toDate = isoDate(0);
  if (useCustom && customFrom && customTo) return { fromDate: customFrom, toDate: customTo };
  if (period === 1) return { fromDate: isoDate(0), toDate };
  return { fromDate: isoDate(-period + 1), toDate };
}

/* ── Data processing helpers ── */

export function computeOrderMetrics(orders: OrderRow[]) {
  const completed = orders.filter(o => o.status === "completed");
  const cancelled = orders.filter(o => o.status === "cancelled");
  const active = orders.filter(o => o.status !== "cancelled" && o.status !== "void");
  // A fully-refunded order still counts toward orderCount/completed (it did
  // happen), but its total is dropped from revenue — matches the exclusion
  // dashboard-gross-sales already applies, so this screen's numbers agree
  // with the Dashboard's instead of still showing refunded money as revenue.
  const grossRevenue = active.reduce((sum, o) => sum + (o.payment_status === "refunded" ? 0 : o.total), 0);
  const netRevenue = completed.reduce((sum, o) => sum + (o.payment_status === "refunded" ? 0 : o.total), 0);
  const orderCount = orders.length;
  const avgOrderValue = completed.length > 0 ? netRevenue / completed.length : 0;
  const cancellationRate = orderCount > 0 ? (cancelled.length / orderCount) * 100 : 0;
  const lostRevenue = cancelled.reduce((sum, o) => sum + o.total, 0);
  const customerCount = new Set(active.map(o => o.customer_id).filter((id): id is string => !!id)).size;
  return { completed, cancelled, active, grossRevenue, netRevenue, orderCount, avgOrderValue, cancellationRate, lostRevenue, customerCount };
}

export function buildPaymentBars(payRes: SectionRes): PaymentBar[] {
  // Reads from the `transactions` ledger, where a split payment already has
  // one row per leg (payments-cash-confirm settles each leg with its own
  // insert) — grouping+counting these rows directly means a split order's
  // legs are automatically counted toward each of their own methods, not
  // collapsed into one "transaction" for whichever method happened first.
  const payMap: Record<string, { value: number; count: number }> = {};
  for (const tx of ((payRes.data?.["reports-payment-breakdown"] ?? []) as RawPaymentBreakdownRow[])) {
    const key = tx.payment_method ?? "unknown";
    const entry = payMap[key] ?? { value: 0, count: 0 };
    entry.value += Number(tx.amount ?? 0);
    entry.count += 1;
    payMap[key] = entry;
  }
  return Object.entries(payMap)
    .map(([label, v]) => ({ label, value: v.value, count: v.count }))
    .sort((a, b) => b.value - a.value);
}

export function buildRefundTotal(refundRes: SectionRes): number {
  return ((refundRes.data?.["reports-refund-total"] ?? []) as RawRefundTotalRow[])
    .reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);
}

export function buildProductAndCategoryData(itemsRes: SectionRes) {
  const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  const catMap: Record<string, number> = {};
  for (const item of ((itemsRes.data?.["reports-product-ranking"] ?? []) as RawProductRankingRow[])) {
    const pid = item.product_id as string;
    const name = item.products?.name ?? "Unknown";
    const cat = item.products?.product_categories?.name ?? "Uncategorized";
    const qty = Number(item.quantity ?? 0);
    const rev = Number(item.total ?? 0);
    if (!prodMap[pid]) prodMap[pid] = { name, qty: 0, revenue: 0 };
    prodMap[pid].qty += qty; prodMap[pid].revenue += rev;
    catMap[cat] = (catMap[cat] ?? 0) + rev;
  }
  const topProducts: ProductRow[] = Object.entries(prodMap)
    .map(([product_id, v]) => ({ product_id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);
  const categoryRows: CategoryRow[] = Object.entries(catMap)
    .map(([label, revenue]) => ({ label, revenue }))
    .sort((a, b) => b.revenue - a.revenue);
  return { topProducts, categoryRows };
}

export function buildDailyTrend(active: OrderRow[]): DailyPoint[] {
  const dateMap: Record<string, { revenue: number; orders: number }> = {};
  for (const o of active) {
    const key = new Date(o.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    if (!dateMap[key]) dateMap[key] = { revenue: 0, orders: 0 };
    dateMap[key].revenue += o.total; dateMap[key].orders += 1;
  }
  return Object.entries(dateMap).map(([date, v]) => ({
    date, revenue: v.revenue, orders: v.orders,
    avgOrder: v.orders > 0 ? v.revenue / v.orders : 0,
  }));
}

export function buildChannelRows(channelRes: SectionRes): ChannelRow[] {
  const chMap: Record<string, { orders: number; revenue: number }> = {};
  for (const o of ((channelRes.data?.["reports-channel-breakdown"] ?? []) as RawChannelBreakdownRow[])) {
    if (o.status === "cancelled" || o.status === "void") continue;
    const ch = o.order_type ?? "unknown";
    if (!chMap[ch]) chMap[ch] = { orders: 0, revenue: 0 };
    chMap[ch].orders += 1;
    if (o.payment_status !== "refunded") chMap[ch].revenue += Number(o.total ?? 0);
  }
  return Object.entries(chMap)
    .map(([label, v]) => ({ label: DD_OPTION_LABELS[label] ?? label, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

/* ── Fetch-params helpers ── */

export function buildOrdersParams(since: string, chFilters: string[], payFilters: string[], until?: string): Record<string, unknown> {
  return {
    since,
    ...(until ? { until } : {}),
    ...(chFilters.length > 0 ? { channels: chFilters } : {}),
    ...(payFilters.length > 0 ? { payment_methods: payFilters } : {}),
  };
}

export function buildItemsParams(since: string, catFilters: string[], until?: string): Record<string, unknown> {
  return {
    since,
    ...(until ? { until } : {}),
    ...(catFilters.length > 0 ? { category: catFilters } : {}),
  };
}

export function mapOrderRows(ordersRes: SectionRes): OrderRow[] {
  return ((ordersRes.data?.["reports-orders-main"] ?? []) as RawOrderMainRow[]).map((o) => ({
    id: o.id, order_no: o.order_no, total: Number(o.total),
    status: o.status, payment_status: o.payment_status ?? null, created_at: o.created_at,
    customer_id: o.customer_id ?? null,
    table_no: o.table_no ?? null, notes: o.notes ?? null,
  }));
}

export function assembleReportsData(
  ordersRes: SectionRes,
  channelRes: SectionRes,
  itemsRes: SectionRes,
  payRes: SectionRes,
  refundRes: SectionRes,
): ReportsData {
  const orders = mapOrderRows(ordersRes);
  const {
    completed, cancelled, active,
    grossRevenue, netRevenue, orderCount, avgOrderValue, cancellationRate, lostRevenue, customerCount,
  } = computeOrderMetrics(orders);
  const paymentBars = buildPaymentBars(payRes);
  const refundTotal = buildRefundTotal(refundRes);
  const { topProducts, categoryRows } = buildProductAndCategoryData(itemsRes);
  const dailyTrend = buildDailyTrend(active);
  const channelRows = buildChannelRows(channelRes);
  return {
    grossRevenue, netRevenue, orderCount, avgOrderValue, cancellationRate, customerCount,
    cancelledCount: cancelled.length, lostRevenue, refundTotal,
    paymentBars, topProducts, recentOrders: orders,
    dailyTrend, channelRows, categoryRows,
  };
}
