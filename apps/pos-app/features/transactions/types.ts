export interface Order {
  id: string; order_no: string; total: number; subtotal: number;
  tax: number; service_fee: number; discount: number; status: string;
  payment_status: string | null; balance_due: number | null; source: string | null;
  created_at: string; order_type: string | null;
  table_no: string | null; notes: string | null; cancel_reason: string | null;
  payment_methods?: { method: string; amount: number }[];
  is_senior_pwd?: boolean;
  discount_source?: "manual" | "senior_pwd" | "loyalty" | "voucher" | "mixed" | null;
  voucher_code?: string | null;
  /** True for a synthetic row built from offlineReceipts.ts's local cache —
   *  an order queued offline that hasn't synced to the server yet, so it has
   *  no real id/detail/cancel-refund capability, only a cached receipt for
   *  reprint. See useTransactionsList.ts and app/pos/transactions.tsx. */
  pending_sync?: boolean;
}

export interface OrderItem {
  id: string; quantity: number; unit_price: number; total: number;
  notes: string | null; status?: string; products: { name: string; sku?: string | null; prep_station?: string | null } | null;
  addons?: { id: string; addon_id: string; name: string; price: number; qty: number }[];
}

export interface ExportRow {
  order_no: string; created_at: string; order_type: string | null; source: string | null;
  table_no: string | null; notes: string | null; subtotal: number | null; tax: number | null;
  service_fee: number | null; total: number; status: string;
  payment_methods?: { method: string; amount: number }[];
}

export interface DetailPayment {
  payment_id: string; amount: number; methods?: { method: string; amount: number }[];
  cash_received?: number | null; change?: number | null; ref_number?: string | null;
}

export type DateFilter = "today" | "week" | "month" | "all";
export type StatusFilter = "all" | "pending" | "completed" | "cancelled";
export type SourceFilter = "all" | "pos" | "web" | "kiosk";
export type PaymentFilter = "all" | "cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer";
export type CollectMethod = "cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer";

// Order-History "Payment" filter chips — mirror the checkout method picker.
export const PAYMENT_FILTERS: { id: PaymentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "cash", label: "Cash" },
  { id: "gcash", label: "GCash" },
  { id: "maya", label: "Maya" },
  { id: "card", label: "Card" },
  { id: "qrph", label: "QR Ph" },
  { id: "bank_transfer", label: "Bank" },
];

// Specific payment methods, not a lumped "online" figure — a split payment
// shows every leg (e.g. "Cash ₱200.00 + GCash ₱255.00"), matching the
// checkout screen's own method picker (Cash/GCash/Maya/Card/QR Ph/Bank).
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", bank_transfer: "Bank", other: "Other",
};
