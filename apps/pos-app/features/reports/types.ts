import type { Feather } from "@expo/vector-icons";

export type Period = 1 | 7 | 30 | 90;
export type TrendMetric = "revenue" | "orders" | "avgOrder";
export type ProdMetric = "revenue" | "qty";
export type DDType = "ch" | "pay" | "cat";
export type Tab = "overview" | "products" | "payments" | "detailed" | "bookings" | "staff" | "shifts" | "discounts" | "customers";

export interface OrderRow {
  id: string; order_no: string; total: number; status: string; payment_status: string | null; created_at: string;
  customer_id: string | null; table_no: string | null; notes: string | null;
}
export interface OrderItem {
  id: string; quantity: number; unit_price: number; total: number;
  notes: string | null; products: { name: string; sku?: string | null; prep_station?: string | null } | null;
  addons?: { name: string; price: number; qty: number }[];
}
export interface OrderPricing {
  subtotal: number | string; tax: number | string; tax_rate_pct: number | string;
  service_fee: number | string; service_rate_pct: number | string; discount: number | string;
  is_senior_pwd?: boolean;
  discount_source?: "manual" | "senior_pwd" | "loyalty" | "voucher" | "mixed" | null;
  voucher_code?: string | null;
  cashier_name?: string | null;
  payment_method: string | null; payment_methods?: { method: string; amount: number }[];
  ref_number: string | null;
  cash_amount: number | string | null; change_amount: number | string | null;
  order_type: string | null;
}
export interface PaymentBar { label: string; value: number; count: number }
export interface ProductRow { product_id: string; name: string; qty: number; revenue: number }
export interface DailyPoint { date: string; revenue: number; orders: number; avgOrder: number }
export interface ChannelRow { label: string; orders: number; revenue: number }
export interface CategoryRow { label: string; revenue: number }
export interface DDMenu { type: DDType; x: number; y: number }

export interface ReportsData {
  grossRevenue: number; netRevenue: number;
  orderCount: number; avgOrderValue: number; customerCount: number;
  cancellationRate: number; cancelledCount: number; lostRevenue: number;
  refundTotal: number;
  paymentBars: PaymentBar[]; topProducts: ProductRow[];
  recentOrders: OrderRow[]; dailyTrend: DailyPoint[];
  channelRows: ChannelRow[]; categoryRows: CategoryRow[];
}

/* ── Extended-tab data interfaces ── */

export interface BookingResourceRow { name: string; type: string; bookings: number; revenue: number }
export interface BookingDayRow { date: string; bookings: number }
export interface BookingStats {
  totalBookings: number; revenue: number;
  cancellationRate: number; noShowRate: number;
  byResource: BookingResourceRow[];
  byDay: BookingDayRow[];
}

export interface StaffRow {
  cashier_id: string | null; name: string;
  orders: number; grossSales: number; netSales: number;
  cancellations: number; discountsGiven: number;
}

export interface ShiftPaymentBreakdown {
  cash: number; gcash: number; maya: number; card: number; qrph: number; bank_transfer: number; other: number;
}
export interface ShiftHistoryRow {
  id: string; cashierName: string; registerName: string | null; branchName: string | null; status: string;
  openedAt: string; closedAt: string | null;
  openingFloat: number; closingFloat: number | null; expectedFloat: number | null; variance: number | null;
  reconciledAt: string | null; transactionCount: number;
  paymentBreakdown: ShiftPaymentBreakdown; totalSales: number;
}
export interface ShiftCashierSummaryRow {
  cashierName: string; shiftCount: number; totalSales: number;
  paymentBreakdown: ShiftPaymentBreakdown; shortageTotal: number; overageTotal: number;
}
export interface ShortageDayRow { date: string; shortageTotal: number; overageTotal: number; netVariance: number }
export interface ShiftHistoryResponse {
  shifts?: ShiftHistoryRow[] | null;
  summaryByCashier?: ShiftCashierSummaryRow[] | null;
  shortageByDay?: ShortageDayRow[] | null;
}

export interface VoucherRow { code: string; uses: number; totalDiscounted: number }
export interface DiscountStats {
  totalDiscount: number; discountRate: number; totalRefunds: number;
  manualDiscount: number; seniorPwdDiscount: number; voucherDiscount: number;
  topVouchers: VoucherRow[];
}

export interface CustomerRow {
  customer_id: string; name: string; phone: string;
  orders: number; totalSpend: number; loyaltyPoints: number;
}
export interface CustomerStats {
  totalCustomers: number; repeatCustomers: number; repeatRate: number;
  topCustomers: CustomerRow[];
}

/* ── Raw shapes returned by the `pos-data` / `reports-extended` edge functions ── */

export interface RawPaymentBreakdownRow { payment_method?: string | null; amount?: number | null }
export interface RawRefundTotalRow { amount?: number | null }
export interface RawProductRankingRow {
  product_id: string;
  products?: { name?: string | null; product_categories?: { name?: string | null } | null } | null;
  quantity?: number | null;
  total?: number | null;
}
export interface RawChannelBreakdownRow { status?: string | null; payment_status?: string | null; order_type?: string | null; total?: number | null }
export interface RawOrderMainRow {
  id: string; order_no: string; total: number | string; status: string; payment_status?: string | null; created_at: string;
  customer_id?: string | null; table_no?: string | null; notes?: string | null;
}

export interface RawBookingResourceRow { name?: string | null; type?: string | null; bookings?: number | null; revenue?: number | null }
export interface RawBookingDayRow { date?: string | null; bookings?: number | null }
export interface BookingsAnalyticsResponse {
  total_bookings?: number | null; revenue?: number | null;
  cancellation_rate?: number | null; no_show_rate?: number | null;
  by_resource?: RawBookingResourceRow[] | null;
  by_day?: RawBookingDayRow[] | null;
}

export interface RawStaffRow {
  cashier_id?: string | null; name?: string | null;
  orders?: number | null; gross_sales?: number | null; net_sales?: number | null;
  cancellations?: number | null; discounts_given?: number | null;
}
export interface StaffPerformanceResponse { staff?: RawStaffRow[] | null }

export interface RawVoucherRow { code?: string | null; uses?: number | null; total_discounted?: number | null }
export interface DiscountsRefundsResponse {
  total_discount?: number | null; discount_rate?: number | null; total_refunds?: number | null;
  manual_discount?: number | null; senior_pwd_discount?: number | null; voucher_discount?: number | null;
  top_vouchers?: RawVoucherRow[] | null;
}

export interface RawCustomerRow {
  customer_id?: string | null; name?: string | null; phone?: string | null;
  orders?: number | null; total_spend?: number | null; loyalty_points?: number | null;
}
export interface CustomerLtvResponse {
  total_customers?: number | null; repeat_customers?: number | null; repeat_rate?: number | null;
  top_customers?: RawCustomerRow[] | null;
}

export type SectionRes = { data: Record<string, unknown[]> | null };

export const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "products", label: "Products", icon: "star" },
  { id: "payments", label: "Payments", icon: "credit-card" },
  { id: "detailed", label: "Detailed", icon: "list" },
  { id: "bookings", label: "Bookings", icon: "calendar" },
  { id: "staff", label: "Staff", icon: "users" },
  { id: "shifts", label: "Shifts", icon: "clock" },
  { id: "discounts", label: "Discounts", icon: "tag" },
  { id: "customers", label: "Customers", icon: "user" },
];

export const PERIODS: { label: string; days: Period }[] = [
  { label: "Today", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
];

// Real orders.order_type values (CHECK constraint, 0006_pos_tables.sql) and
// real payment_intents.provider values — not guessed vocabulary.
export const CHANNELS = ["dine_in", "takeout", "room_service", "walk_in", "qr_order", "delivery"] as const;
export const PAYMENTS = ["cash", "gcash", "maya", "card", "qrph", "bank_transfer"] as const;
export const CATEGORIES = ["food", "beverage", "dessert", "merchandise"] as const;

export const DD_OPTIONS: Record<DDType, string[]> = {
  ch: [...CHANNELS], pay: [...PAYMENTS], cat: [...CATEGORIES],
};
export const DD_LABELS: Record<DDType, string> = {
  ch: "Channel", pay: "Payment", cat: "Category",
};
export const DD_OPTION_LABELS: Record<string, string> = {
  dine_in: "Dine In", takeout: "Takeout", room_service: "Room Service",
  walk_in: "Walk-in", qr_order: "QR Order", delivery: "Delivery",
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", bank_transfer: "Bank Transfer",
};

export const STATUS_COLOR: Record<string, string> = {
  completed: "#48a86e", preparing: "#d0a828",
  pending: "#4890b0", cancelled: "#c03838", void: "#8a8a8a",
};
