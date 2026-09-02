/**
 * Shared POS order-domain types.
 *
 * Extracted from app/pos/order.tsx so the cart reducer, cart panel, totals and
 * any other order-related component can share one definition instead of the
 * screen owning them all. Pure types — no runtime code.
 */
import type { CartCharge } from "../pos-order/components/CustomChargeModal";

export type { CartCharge };

export interface AddonGroup {
  id: string; name: string; is_required: boolean;
  min_select: number; max_select: number;
  addons: { id: string; name: string; price: number }[];
}

export interface SelectedAddon {
  addon_id: string; group_id: string; name: string; price: number; qty: number;
}

export interface Product {
  id: string; name: string; price: number; sku?: string | null;
  category: string; image_url?: string | null;
  stock_status?: string; available_quantity?: number | null;
  addon_groups?: AddonGroup[];
  is_pinned?: boolean;
  prep_station?: string | null;
  /** POS visibility (products.active). false = quickly marked unavailable — order-product-list
   *  still returns these (unlike archived ones) so the tile can render greyed out. */
  active?: boolean;
  /** Bundle/platter inclusions (e.g. "4 Pork BBQ, 4 Chicken BBQ, 1 Inasal,
   *  Rice Platter") — pre-fills the cart line's notes on add so it prints on
   *  the kitchen ticket; the cashier can still edit/append to it per order. */
  description?: string | null;
}

export interface Resource {
  id: string; name: string; type: "room" | "amenity";
  capacity: number | null; hourly_rate: number; nightly_rate: number | null; branch_id: string | null;
}

export interface CartItem {
  product: Product; qty: number; notes: string; addons?: SelectedAddon[];
  /** Per-item discount input, in the unit given by discountType (peso or %). */
  discount?: number;
  discountType?: DiscountType;
}

export interface BookingCartItem {
  tempId: string;
  type: "room" | "amenity";
  resourceId: string; resourceName: string;
  startISO: string; endISO: string;
  guestName: string; guestPhone: string; guestEmail: string; notes: string;
  hourlyRate: number; branchId: string | null;
  total: number;
  existingBookingId?: string;
}

/** Product-vs-booking tab in the order screen. */
export type Tab = "products" | "amenity" | "room";

export type OrderType = "dine_in" | "takeout" | "room_service" | "walk_in";
export type DiscountType = "amount" | "percent";
export type PayMethod = "cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer" | "split";

export interface AppliedVoucher {
  id: string; code: string; name: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_cap: number | null;
  min_spend: number;
  applies_to: string;
}

export interface Cart {
  items: CartItem[];
  bookings: BookingCartItem[];
  charges: CartCharge[];
  orderType: OrderType;
  tableNo: string;
  customerName: string;
  discount: number;
  discountType: DiscountType;
  is_senior_pwd: boolean;
  discount_manager_approval_id?: string;
  internalNote: string;
  /** Dine-in floor/seating-area quick-select (1st Flr, 2nd Flr, RF Top, Alfresco, ...) — tells the server where to deliver. Empty for non-dine-in orders. */
  floor: string;
  loyalty_points_to_redeem: number;
  loyalty_peso_discount: number;
  applied_voucher: AppliedVoucher | null;
}

/** Raw voucher row as returned by the vouchers edge functions (numeric columns
 *  can arrive as strings from PostgREST, hence the `| string` unions). */
export interface ApiVoucher {
  id: string; code: string; name: string;
  discount_type: "percentage" | "fixed";
  discount_value: number | string;
  max_cap: number | string | null;
  min_spend: number | string;
  applies_to: string;
  status?: string | null;
  valid_until?: string | null;
  valid_from?: string | null;
  usage_limit: number | null;
  usage_count: number;
}

export const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "cash",  label: "Cash"  },
  { id: "gcash", label: "GCash" },
  { id: "maya",  label: "Maya"  },
  { id: "card",  label: "Card"  },
  { id: "qrph",  label: "QR PH" },
  { id: "bank_transfer", label: "Bank" },
];

/** Methods offered in the split-payment picker (no nested "split"). */
export type SplitMethod = "cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer";

export const ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: "dine_in",      label: "Dine-in" },
  { id: "takeout",      label: "Takeout" },
  { id: "room_service", label: "Room Service" },
];

/** Dine-in floor/seating-area quick-select options — shown only when orderType is "dine_in". */
export const FLOOR_OPTIONS: string[] = ["1st Flr", "2nd Flr", "RF Top", "Alfresco"];

export interface LoyaltyRules {
  min_redeem_points?: number;
  peso_per_point?: number;
  max_redeem_pct?: number;
}

export interface TicketResult {
  orderId: string;
  orderNo: string;
  tableNo: string | null;
  items: { productId: string; name: string; price: number; qty: number; notes: string | null }[];
}

/* ── API response row shapes (pos-data edge function payloads) ── */
export interface ApiProductRow {
  id: string; name: string; price: number | string; sku?: string | null;
  product_categories?: { name?: string | null } | null;
  image_url?: string | null;
  stock_status?: string | null;
  available_quantity?: number | null;
  is_pinned?: boolean | null;
  prep_station?: string | null;
  addon_groups?: AddonGroup[] | null;
  active?: boolean | null;
  description?: string | null;
}
export interface ApiWorkspaceConfig {
  name?: string | null;
  tax_rate?: number | string | null;
  service_rate?: number | string | null;
  receipt_address?: string | null;
  receipt_tin?: string | null;
  receipt_footer?: string | null;
  receipt_wifi_ssid?: string | null;
  receipt_wifi_cred?: string | null;
  receipt_promo_line?: string | null;
  receipt_logo?: string | null;
  receipt_order_prefix?: string | null;
  payment_config?: Record<string, string> | null;
}
export interface ApiResourceRow {
  id: string; name: string; type: string;
  capacity?: number | string | null;
  hourly_rate: number | string;
  nightly_rate?: number | string | null;
  branch_id?: string | null;
}
export interface ApiTicketOrder {
  id: string; order_no: string; table_no: string | null;
}
export interface ApiTicketItem {
  products?: { id: string; name: string } | null;
  unit_price: number | string;
  quantity: number;
  notes: string | null;
}
export interface LoyaltyBalanceResponse {
  balance: number;
  rules?: LoyaltyRules | null;
}
export interface ManagerApprovalCreateResponse {
  approval?: { id: string } | null;
}
