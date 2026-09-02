// Canonicalize a PH mobile number for comparison. Reduces to digits only and
// normalizes to the 63XXXXXXXXXX form, so 0917…, +63917…, 63917…, and spaced
// or dashed variants all compare equal. Used for ownership checks where the
// guest may re-enter their number in a different format than it was stored.
export function normalizePhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("63")) return d;
  if (d.startsWith("0")) return "63" + d.slice(1);
  if (d.length === 10 && d.startsWith("9")) return "63" + d; // bare 9XXXXXXXXX
  return d;
}

// True for a normalizePhone() result that's a real PH mobile number:
// 63 + 9 + 9 more digits (12 digits total, e.g. 639171234567).
export function isValidPHMobile(normalized: string): boolean {
  return /^639\d{9}$/.test(normalized);
}
