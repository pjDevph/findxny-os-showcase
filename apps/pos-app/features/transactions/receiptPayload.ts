import type { ReceiptPayload } from "../receipt/receiptConfig";
import { buildReceiptPayloadFromOrder } from "../receipt/buildReceiptPayloadFromOrder";
import { guestName } from "./transactionsHelpers";
import type { DetailPayment, Order, OrderItem } from "./types";

export function buildReceiptPayload(
  order: Order,
  items: OrderItem[],
  detailPayment: DetailPayment | null,
  cashierName?: string | null,
): ReceiptPayload {
  const sub = Number(order.subtotal ?? 0), svc = Number(order.service_fee ?? 0);
  // Real payment info (method/amount per leg, cash tendered/change, ref
  // number) — this used to be hardcoded to cash/₱0/₱0 regardless of how
  // the order was actually paid, so a Maya or split-paid order's reprint
  // silently showed the wrong method with no amount.
  const methods = detailPayment?.methods ?? [];
  const primaryMethod = methods[0]?.method ?? "cash";

  return buildReceiptPayloadFromOrder({
    orderId: order.id,
    orderNo: order.order_no,
    items: items.map(i => ({
      name: i.products?.name ?? "—", sku: i.products?.sku ?? null, qty: i.quantity,
      price: Number(i.unit_price), notes: i.notes, prep_station: i.products?.prep_station ?? null,
      addons: i.addons?.map(a => ({ name: a.name, price: Number(a.price), qty: a.qty })) ?? [],
    })),
    subtotal: sub, tax: Number(order.tax ?? 0),
    // 0 (not a hardcoded 0.12/12%) when there's no subtotal to derive a rate
    // from — matches receipts-orders-list's tax_rate_pct fallback
    // (pos-data/index.ts) so both reprint entry points show the same label
    // for a fully-comped/discounted order instead of assuming a rate that
    // may not match this workspace's actual configured tax rate.
    taxRatePct: sub > 0 ? Number(order.tax) / sub : 0,
    serviceFee: svc, svcRatePct: sub > 0 ? svc / sub : 0, discount: Number(order.discount ?? 0),
    total: Number(order.total ?? 0),
    isSeniorPwd: order.is_senior_pwd,
    discountSource: order.discount_source,
    voucherCode: order.voucher_code,
    cashAmt: Number(detailPayment?.cash_received ?? 0),
    change: Number(detailPayment?.change ?? 0),
    payMethod: primaryMethod,
    refNumber: detailPayment?.ref_number ?? "",
    // DetailPayment only stores one ref_number for the whole order (not per
    // leg) — same single reference applied to every non-cash leg, matching
    // what this screen's payment detail panel already shows.
    paymentMethods: methods.map(m => ({
      method: m.method, amount: m.amount,
      refNumber: m.method !== "cash" ? (detailPayment?.ref_number ?? undefined) : undefined,
    })),
    orderType: order.order_type ?? "dine_in", tableNo: order.table_no ?? "",
    customerName: guestName(order), timestamp: order.created_at,
    cashierName,
  });
}
