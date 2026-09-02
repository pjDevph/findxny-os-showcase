/**
 * Order-screen currency formatting.
 *
 * Extracted from app/pos/order.tsx so the cart panel, totals and discount modal
 * all format money identically. Fixed 2-decimal peso — matches what the receipt
 * and ESC/POS generators print.
 *
 * This is the one canonical peso() for the whole app — reports.tsx and
 * shift.tsx each used to re-declare their own version (one with thousands
 * separators, one without), so money printed inconsistently screen to screen.
 * Pass `{ grouped: true }` for the thousands-separator form (reports/summary
 * screens); the plain form stays the default so every existing call site
 * (receipts, ESC/POS, cart totals) is unaffected.
 */
export const peso = (n: number, opts?: { grouped?: boolean }) =>
  opts?.grouped
    ? `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₱${n.toFixed(2)}`;
