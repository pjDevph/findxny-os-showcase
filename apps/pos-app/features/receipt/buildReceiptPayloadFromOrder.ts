/**
 * One shared mapping from "an order's stored data" to a ReceiptPayload, used
 * by every reprint entry point (Order History, Reports, Receipts tab). Each
 * screen fetches its own order/items/payment shape (their backend queries
 * differ), then adapts it into OrderReceiptSource before calling this — the
 * checkout screen's own payload builder can't be reused directly since it
 * works from live cart state, not a database row reconstructed after the
 * fact, but the actual field mapping only needs to exist once.
 *
 * This replaced three independent implementations that had each quietly
 * drifted from what a fresh checkout receipt shows: cashier name, item
 * add-ons, SC/PWD and voucher discount labels, and split-payment legs were
 * each missing from at least one of the three reprint screens.
 */
import type { ReceiptPayload } from "./receiptConfig";

export interface OrderReceiptItem {
  name: string;
  sku?: string | null;
  qty: number;
  price: number;
  notes?: string | null;
  prep_station?: string | null;
  addons?: { name: string; price: number; qty: number }[];
}

export interface OrderReceiptPaymentMethod {
  method: string;
  amount: number;
  refNumber?: string | null;
}

export interface OrderReceiptSource {
  orderId?: string;
  orderNo: string;
  timestamp: string;
  orderType: string;
  tableNo: string;
  customerName: string;
  internalNote?: string | null;
  /** Dine-in floor/seating-area (orders.serve_location). Only meaningful when orderType is "dine_in". */
  floor?: string | null;
  cashierName?: string | null;
  items: OrderReceiptItem[];
  bookings?: { name: string; total: number }[];
  subtotal: number;
  tax: number;
  taxRatePct: number;
  serviceFee: number;
  svcRatePct: number;
  discount: number;
  total: number;
  isSeniorPwd?: boolean;
  /** Orders schema enum (0063_vouchers.sql). */
  discountSource?: "manual" | "senior_pwd" | "loyalty" | "voucher" | "mixed" | null;
  voucherCode?: string | null;
  payMethod: string;
  refNumber?: string | null;
  cashAmt?: number | null;
  change?: number | null;
  /** >1 entry means a split payment; a single entry is just the plain method. */
  paymentMethods?: OrderReceiptPaymentMethod[];
  balanceDue?: number | null;
}

export function buildReceiptPayloadFromOrder(src: OrderReceiptSource): ReceiptPayload {
  const isSplit = (src.paymentMethods?.length ?? 0) > 1;
  const hasBalance = src.balanceDue != null && src.balanceDue > 0;

  return {
    orderNo: src.orderNo,
    orderId: src.orderId,
    items: src.items.map(i => ({
      name: i.name, sku: i.sku ?? null, qty: i.qty, price: i.price,
      notes: i.notes ?? null, prep_station: i.prep_station ?? null,
      addons: i.addons ?? [],
    })),
    bookings: (src.bookings ?? []).map(b => ({ name: b.name, total: b.total })),
    subtotal: src.subtotal, tax: src.tax, taxRatePct: src.taxRatePct,
    serviceFee: src.serviceFee, svcRatePct: src.svcRatePct,
    discount: src.discount, total: src.total,
    cashAmt: src.cashAmt ?? 0, change: src.change ?? 0,
    payMethod: src.payMethod, refNumber: src.refNumber ?? "",
    ...(isSplit ? {
      splitPayments: src.paymentMethods!.map(m => ({
        method: m.method, amount: m.amount, refNumber: m.refNumber ?? undefined,
      })),
    } : {}),
    orderType: src.orderType, tableNo: src.tableNo,
    customerName: src.customerName, timestamp: src.timestamp,
    internalNote: src.internalNote ?? undefined,
    floor: src.floor ?? undefined,
    cashierName: src.cashierName ?? undefined,
    is_senior_pwd: src.isSeniorPwd ?? undefined,
    // Only surfaced when the WHOLE stored discount is attributable to the
    // voucher (discount_source === "voucher"). "mixed" combines a voucher
    // with a manual/senior discount in the same column — splitting that back
    // out needs the original redemption row, which isn't fetched here, so it
    // falls back to the plain "Discount" line rather than risk a wrong
    // number on a receipt.
    voucherDiscount: src.discountSource === "voucher" && src.discount > 0 ? src.discount : undefined,
    appliedVoucherCode: src.discountSource === "voucher" ? (src.voucherCode ?? undefined) : undefined,
    balanceDue: src.balanceDue ?? undefined,
    amountPaid: hasBalance ? src.total - (src.balanceDue as number) : undefined,
  };
}
