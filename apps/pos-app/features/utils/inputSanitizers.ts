/**
 * Input sanitizers for controlled <TextInput> fields.
 *
 * Each function is a pure string→string transform meant to be dropped straight
 * into `onChangeText` so an input can only ever hold a well-formed value while
 * the user is typing (rather than validating after the fact on submit). They
 * intentionally tolerate in-progress states — "", "0.", "12." — so typing feels
 * natural; use the parse/validate helpers at submit time to read final values.
 *
 * Pair each sanitizer with the matching `keyboardType`:
 *   - integer / money / percent → "number-pad" (integer) or "decimal-pad" (money)
 *   - phone                     → "phone-pad"
 *   - email                     → "email-address"
 */

/** Digits only. Strips leading zeros ("007" → "7"), optional max clamp. */
export function sanitizeInteger(raw: string, opts: { max?: number; maxLen?: number } = {}): string {
  let s = raw.replace(/[^0-9]/g, "");
  s = s.replace(/^0+(?=\d)/, "");
  if (opts.maxLen != null) s = s.slice(0, opts.maxLen);
  if (opts.max != null && s !== "" && Number(s) > opts.max) s = String(opts.max);
  return s;
}

/**
 * Decimal number: digits + a single leading-collapsed decimal point, capped to
 * `maxDecimals` fractional digits (default 2). Allows "0.", "12.", ".5" while
 * typing. Use for currency and other non-negative decimal amounts.
 */
export function sanitizeDecimal(raw: string, opts: { maxDecimals?: number } = {}): string {
  const maxDecimals = opts.maxDecimals ?? 2;
  let s = raw.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    // Keep only the first dot; drop any later ones.
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    const [intPart, decPart = ""] = s.split(".");
    s = maxDecimals > 0 ? `${intPart}.${decPart.slice(0, maxDecimals)}` : intPart;
  }
  // Collapse leading zeros but keep a single "0" before the point ("00.5" → "0.5").
  s = s.replace(/^0+(?=\d)/, "");
  return s;
}

/** Money = non-negative decimal with 2 fractional digits. */
export function sanitizeMoney(raw: string): string {
  return sanitizeDecimal(raw, { maxDecimals: 2 });
}

/** Percent: decimal (default 2 dp) clamped to 0–100 as a final value. */
export function sanitizePercent(raw: string, opts: { maxDecimals?: number } = {}): string {
  const s = sanitizeDecimal(raw, { maxDecimals: opts.maxDecimals ?? 2 });
  if (s === "" || s === ".") return s;
  const n = Number(s);
  if (!Number.isNaN(n) && n > 100) return "100";
  return s;
}

/**
 * Phone number: digits with an optional single leading "+". No spaces/letters.
 * Capped at 15 chars (E.164 max). Suits PH numbers ("09xxxxxxxxx" / "+639…").
 */
export function sanitizePhone(raw: string): string {
  let s = raw.replace(/[^0-9+]/g, "");
  s = s[0] === "+" ? "+" + s.slice(1).replace(/\+/g, "") : s.replace(/\+/g, "");
  return s.slice(0, 15);
}

/** Digits only, capped to `len` — for numeric PIN/OTP/code fields. */
export function sanitizePin(raw: string, len = 6): string {
  return raw.replace(/[^0-9]/g, "").slice(0, len);
}

/** Alphanumeric code (uppercased) — voucher codes, SKUs. No spaces/symbols. */
export function sanitizeCode(raw: string, opts: { maxLen?: number } = {}): string {
  let s = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (opts.maxLen != null) s = s.slice(0, opts.maxLen);
  return s;
}

/** Date text as the user types toward YYYY-MM-DD: digits + dashes, max 10. */
export function sanitizeDateStr(raw: string): string {
  return raw.replace(/[^0-9-]/g, "").slice(0, 10);
}

/** Time-of-day text toward HH:MM: digits + colon, max 5. */
export function sanitizeTimeStr(raw: string): string {
  return raw.replace(/[^0-9:]/g, "").slice(0, 5);
}

/** True when `s` is a real calendar date in strict YYYY-MM-DD form. */
export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** True when `s` is a valid 24-hour HH:MM time. */
export function isValidTimeStr(s: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return false;
  return Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Parse a sanitized numeric string to a number; "" / "." → 0. */
export function toNumber(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** True when the string is a syntactically plausible email. */
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
