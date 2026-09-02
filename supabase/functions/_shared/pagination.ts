// Single source of truth for list-endpoint page sizes. Plain, dependency-free
// TypeScript so it resolves as-is from both runtimes: Deno edge functions
// (supabase/functions/*) via a relative import, and the Expo/Metro-bundled
// client (apps/pos-app) via a relative import reaching into this folder
// (Metro's watchFolders covers the whole monorepo root).
//
// Client and server must agree on these exact numbers — each list screen's
// "is there another page?" check compares the row count it got back against
// the count it expects, so any mismatch here silently truncates the list
// (this bit products-list, inventory-list, and customers-list before).
export const PAGE_SIZES = {
  productsList: 500,
  orderProductList: 30,
  transactionsList: 20,
  kitchenHistory: 30,
  auditLogEntries: 50,
  receiptsOrdersList: 25,
  inventoryList: 30,
  customersList: 30,
} as const;

// Reports/Analytics aggregate fetches are one-shot (no pagination UI), so
// each cap below just needs to comfortably exceed a real single-branch café's
// order volume for the widest period the UI offers (90 days) — 500-2000 rows
// silently under-counted Gross/Net/Order Count/Payment/Refund totals with no
// indicator once a period had more rows than the cap.
export const REPORTS_CAPS = {
  ordersMain:        5000,
  channelBreakdown:  5000,
  productRanking:    8000,
  paymentBreakdown:  8000,
  refundTotal:       5000,
} as const;
