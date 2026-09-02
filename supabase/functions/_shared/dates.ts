// Voucher date-boundary helpers for the Philippines timezone (Asia/Manila, UTC+8).
//
// PostgreSQL date columns come back as plain strings like "2026-06-25". Naively
// wrapping them in `new Date()` produces a UTC midnight value, which is 8 hours
// *earlier* than the intended PH start-of-day. That causes spurious rejections
// for customers applying a voucher in the morning of its valid_from date.
//
// Rule: a date-only boundary is interpreted as:
//   valid_from  → 00:00:00 Asia/Manila on that date  (earliest moment the code works)
//   valid_until → 23:59:59 Asia/Manila on that date  (latest moment the code works)

const PH_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * Returns the UTC timestamp representing 00:00:00 Asia/Manila on the given
 * date string (YYYY-MM-DD). Vouchers are NOT yet active before this moment.
 */
export function phStartOfDay(dateStr: string): Date {
  // "2026-06-25" → 2026-06-25T00:00:00+08:00 → 2026-06-24T16:00:00.000Z
  return new Date(`${dateStr}T00:00:00+08:00`);
}

/**
 * Returns the UTC timestamp representing 23:59:59 Asia/Manila on the given
 * date string (YYYY-MM-DD). Vouchers ARE still active up to and including this
 * moment.
 */
export function phEndOfDay(dateStr: string): Date {
  // "2026-06-25" → 2026-06-25T23:59:59+08:00 → 2026-06-25T15:59:59.000Z
  return new Date(`${dateStr}T23:59:59+08:00`);
}
