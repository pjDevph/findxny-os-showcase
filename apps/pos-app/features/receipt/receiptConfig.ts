import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ReceiptConfig {
  address:         string;
  tin:             string;
  footer:          string;
  wifiSsid:        string;
  wifiCred:        string;
  promoLine:       string;
  receiptLogo:     string;
  orderNoPrefix:   string;
  /** BIR Permit to Use number */
  ptu_no:          string;
  /** Machine Identification Number */
  min_no:          string;
  /** Document serial series, e.g. "INV-0000001" */
  serial_series:   string;
  /** Accreditation date (YYYY-MM-DD) */
  accred_date:     string;
  /** Software accreditation number */
  accred_no:       string;
}

export const EMPTY_RECEIPT_CONFIG: ReceiptConfig = {
  address:       "",
  tin:           "",
  footer:        "",
  wifiSsid:      "",
  wifiCred:      "",
  promoLine:     "",
  receiptLogo:   "",
  orderNoPrefix: "M2M-",
  ptu_no:        "",
  min_no:        "",
  serial_series: "",
  accred_date:   "",
  accred_no:     "",
};

const KEYS = {
  address:       "pos_receipt_address",
  tin:           "pos_receipt_tin",
  footer:        "pos_receipt_footer",
  wifiSsid:      "pos_receipt_wifi_ssid",
  wifiCred:      "pos_receipt_wifi_cred",
  promoLine:     "pos_receipt_promo_line",
  receiptLogo:   "pos_receipt_logo",
  orderNoPrefix: "pos_receipt_order_prefix",
  ptu_no:        "pos_receipt_ptu_no",
  min_no:        "pos_receipt_min_no",
  serial_series: "pos_receipt_serial_series",
  accred_date:   "pos_receipt_accred_date",
  accred_no:     "pos_receipt_accred_no",
} as const;

export async function loadReceiptConfig(): Promise<ReceiptConfig> {
  const pairs = await AsyncStorage.multiGet(Object.values(KEYS));
  const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
  return {
    address:       m[KEYS.address],
    tin:           m[KEYS.tin],
    footer:        m[KEYS.footer],
    wifiSsid:      m[KEYS.wifiSsid],
    wifiCred:      m[KEYS.wifiCred],
    promoLine:     m[KEYS.promoLine],
    receiptLogo:   m[KEYS.receiptLogo],
    orderNoPrefix: m[KEYS.orderNoPrefix] || "M2M-",
    ptu_no:        m[KEYS.ptu_no],
    min_no:        m[KEYS.min_no],
    serial_series: m[KEYS.serial_series],
    accred_date:   m[KEYS.accred_date],
    accred_no:     m[KEYS.accred_no],
  };
}

export async function saveReceiptConfig(cfg: Partial<ReceiptConfig>): Promise<void> {
  const pairs: [string, string][] = (Object.entries(KEYS) as [keyof typeof KEYS, string][])
    .filter(([k]) => cfg[k] !== undefined)
    .map(([k, storageKey]) => [storageKey, cfg[k]!]);
  if (pairs.length) await AsyncStorage.multiSet(pairs);
}

export function receiptConfigFromWorkspace(
  ws: {
    receipt_address?:        string | null;
    receipt_tin?:            string | null;
    receipt_footer?:         string | null;
    receipt_wifi_ssid?:      string | null;
    receipt_wifi_cred?:      string | null;
    receipt_promo_line?:     string | null;
    receipt_logo?:           string | null;
    receipt_order_prefix?:   string | null;
  } | null | undefined,
): ReceiptConfig {
  return {
    address:       ws?.receipt_address       ?? "",
    tin:           ws?.receipt_tin           ?? "",
    footer:        ws?.receipt_footer        ?? "",
    wifiSsid:      ws?.receipt_wifi_ssid     ?? "",
    wifiCred:      ws?.receipt_wifi_cred     ?? "",
    promoLine:     ws?.receipt_promo_line    ?? "",
    receiptLogo:   ws?.receipt_logo          ?? "",
    orderNoPrefix: ws?.receipt_order_prefix  || "M2M-",
    // Accreditation fields live only in AsyncStorage — not synced to workspace row.
    // loadReceiptConfig() merges them in on device; receiptConfigFromWorkspace preserves blanks.
    ptu_no:        "",
    min_no:        "",
    serial_series: "",
    accred_date:   "",
    accred_no:     "",
  };
}

export interface ReceiptCharge {
  name:   string;
  amount: number;
}

export interface ReceiptPayload {
  orderNo:      string;
  items:        { name: string; sku?: string | null; qty: number; price: number; notes?: string | null; category?: string; prep_station?: string | null; addons?: { name: string; price: number; qty: number }[]; discount?: number }[];
  bookings:     {
    name: string; total: number;
    bookingRef?: string;
    guestName?: string; guestPhone?: string; guestEmail?: string;
    checkIn?: string; checkOut?: string;
  }[];
  /** Custom charges (corkage, delivery, etc.) added via CustomChargeModal */
  charges?:     ReceiptCharge[];
  subtotal:     number;
  tax:          number;
  taxRatePct:   number;
  serviceFee:   number;
  svcRatePct:   number;
  discount:     number;
  total:        number;
  cashAmt:      number;
  change:       number;
  payMethod:    string;
  refNumber:    string;
  /** Split-payment legs (method + amount + optional ref). When present, renderers
   *  print one row per leg instead of the single flat payMethod/refNumber pair. */
  splitPayments?: { method: string; amount: number; refNumber?: string }[];
  orderType:    string;
  tableNo:      string;
  customerName: string;
  /** Cashier-entered internal note for this order (not a per-item note). */
  internalNote?: string;
  /** Dine-in floor/seating-area quick-select (1st Flr, RF Top, ...) — tells the server where to deliver. Only meaningful when orderType is "dine_in". */
  floor?: string;
  /** Name of the staff member who processed this order, for the receipt/tickets. */
  cashierName?: string;
  timestamp:    string;
  /** Booking-only payment mode */
  bookPayMode?: "unpaid" | "full" | "deposit";
  /** Amount actually collected as deposit */
  depositPaid?: number;
  /** DB UUID of this order — required for voucher claiming. */
  orderId?: string;
  /** WiFi voucher code claimed for this order (populated at modal-open time). */
  voucherCode?: string;
  /** Partial payment: amount actually paid now (non-booking orders). */
  amountPaid?: number;
  /** Partial payment: remaining balance after this payment. */
  balanceDue?: number;
  /** SC/PWD discount flag — changes the discount label on the receipt. */
  is_senior_pwd?: boolean;
  /** Voucher discount amount deducted from the order total. */
  voucherDiscount?: number;
  /** Voucher code that was applied (for receipt label). */
  appliedVoucherCode?: string;
}

/**
 * Cashier name falls back to email when a profile has no display name set
 * (see pos-data's cashier_name resolution) — full emails don't fit the
 * value column on narrow receipt paper and get truncated mid-string
 * ("joniebalagoza@gmail.c"). Showing just the local part reads cleanly at
 * any width and is still enough to identify who processed the order.
 */
export function formatCashierName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const at = name.indexOf("@");
  return at > 0 ? name.slice(0, at) : name;
}
