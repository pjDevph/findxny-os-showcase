import { useState } from "react";
import { invokeFn } from "../../services/supabase";
import type { ReceiptPayload } from "../receipt/receiptConfig";
import { buildReceiptPayloadFromOrder } from "../receipt/buildReceiptPayloadFromOrder";
import type { OrderItem, OrderPricing, OrderRow } from "./types";

// Mirrors transactions/transactionsHelpers.ts's guestName() — same "Guest: "
// prefix convention written by order.tsx's buildOrderNotes() at checkout.
// Duplicated rather than imported: the transactions Order type requires
// several fields (subtotal, payment_status, balance_due, ...) that OrderRow
// here doesn't carry, so the two aren't type-compatible.
function guestNameFromNotes(notes: string | null): string {
  if (!notes) return "";
  return notes.startsWith("Guest: ") ? notes.slice(7) : notes;
}

function buildReceiptPayload(order: OrderRow, items: OrderItem[], pricing: OrderPricing | null): ReceiptPayload {
  const fallbackSubtotal = items.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
  return buildReceiptPayloadFromOrder({
    orderId: order.id,
    orderNo: order.order_no,
    items: items.map(i => ({
      name: i.products?.name ?? "—", sku: i.products?.sku ?? null, qty: i.quantity,
      price: Number(i.unit_price), notes: i.notes, prep_station: i.products?.prep_station ?? null,
      addons: i.addons,
    })),
    subtotal: pricing ? Number(pricing.subtotal) : fallbackSubtotal,
    tax: pricing ? Number(pricing.tax) : 0,
    // pricing.tax_rate_pct/service_rate_pct come back as whole percentages
    // (5 meaning 5%), not fractions — printReceiptImin.ts multiplies by 100
    // again for display, so passing these through unconverted printed
    // "500%" instead of "5%".
    taxRatePct: pricing ? Number(pricing.tax_rate_pct) / 100 : 0.12,
    serviceFee: pricing ? Number(pricing.service_fee) : 0,
    svcRatePct: pricing ? Number(pricing.service_rate_pct) / 100 : 0,
    discount: pricing ? Number(pricing.discount) : 0,
    total: Number(order.total ?? 0),
    isSeniorPwd: pricing?.is_senior_pwd,
    discountSource: pricing?.discount_source,
    voucherCode: pricing?.voucher_code,
    cashierName: pricing?.cashier_name,
    cashAmt: pricing ? Number(pricing.cash_amount ?? 0) : 0,
    change: pricing ? Number(pricing.change_amount ?? 0) : 0,
    payMethod: pricing?.payment_method ?? "cash",
    paymentMethods: pricing?.payment_methods,
    refNumber: pricing?.ref_number ?? "",
    orderType: pricing?.order_type ?? "dine_in",
    // Previously hardcoded blank regardless of the real order — a reprint
    // from Reports always showed no table/customer even when the original
    // receipt had them. table_no is a real orders column; customer name for
    // a walk-in (non-loyalty) order lives inside the notes field the same
    // way transactions.tsx's reprint already reads it (buildOrderNotes at
    // checkout writes "Guest: <name> | ...").
    tableNo: order.table_no ?? "", customerName: guestNameFromNotes(order.notes), timestamp: order.created_at,
  });
}

/** Order-detail sheet: fetch items/pricing for one order and offer a reprint. */
export function useOrderDetail(activeWorkspaceId: string | null | undefined) {
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailPricing, setDetailPricing] = useState<OrderPricing | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [receiptPayload, setReceiptPayload] = useState<ReceiptPayload | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  async function openOrderDetail(order: OrderRow) {
    setSelectedOrder(order);
    setDetailLoading(true);
    const { data: d } = await invokeFn<Record<string, unknown>>("pos-data", {
      workspace_id: activeWorkspaceId,
      resource: "reports-order-detail",
      params: { order_id: order.id },
    });
    setDetailItems(((d?.["reports-order-detail"] ?? []) as OrderItem[]));
    setDetailPricing((d?.["reports-order-pricing"] ?? null) as OrderPricing | null);
    setDetailLoading(false);
  }

  function showReprint() {
    if (!selectedOrder) return;
    setReceiptPayload(buildReceiptPayload(selectedOrder, detailItems, detailPricing));
    setShowReceiptModal(true);
  }

  return {
    selectedOrder, setSelectedOrder, detailItems, detailPricing, detailLoading,
    receiptPayload, showReceiptModal, setShowReceiptModal,
    openOrderDetail, showReprint,
  };
}
