import { MAX_NOTES, type Booking } from "./types";

export function parseNotes(raw: string | null): { guestName: string; guestPhone: string; guestEmail: string; noteText: string } {
  if (!raw) return { guestName: "", guestPhone: "", guestEmail: "", noteText: "" };
  const parts = raw.split(" · ");
  const guestName = parts[0] ?? "";
  let guestPhone = "";
  let guestEmail = "";
  let idx = 1;
  if (parts[idx] && (parts[idx].startsWith("+") || parts[idx].startsWith("09") || /^\d{7,}$/.test(parts[idx]))) {
    guestPhone = parts[idx++];
  }
  if (parts[idx] && parts[idx].includes("@")) {
    guestEmail = parts[idx++];
  }
  return { guestName, guestPhone, guestEmail, noteText: parts.slice(idx).join(" · ") };
}

export function nightCount(start: string, end: string): number {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
}

export function bookingRef(id: string): string {
  return "BR-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function fmtExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const minLeft = Math.floor((d.getTime() - now.getTime()) / 60_000);
  if (minLeft <= 0) return "Expired";
  if (minLeft < 60) return `Expires in ${minLeft} min`;
  return `Expires ${d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`;
}

export function isExpired(iso: string | null): boolean {
  return !!iso && new Date(iso) < new Date();
}

export function fmtDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}
export function toISO(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}
export function hoursFrom(s: string, e: string) {
  return Math.max(0, (new Date(e).getTime() - new Date(s).getTime()) / 3_600_000);
}

export function isValidPHPhone(v: string): boolean {
  const s = v.replace(/[\s\-().]/g, "");
  return /^(09\d{9}|\+?639\d{9}|9\d{9})$/.test(s);
}
export function normalizePHPhone(v: string): string {
  const s = v.replace(/[\s\-().]/g, "");
  if (/^09\d{9}$/.test(s)) return "+63" + s.slice(1);
  if (/^9\d{9}$/.test(s)) return "+63" + s;
  if (/^\+639\d{9}$/.test(s)) return s;
  if (/^639\d{9}$/.test(s)) return "+" + s;
  return v;
}
export function isValidName(v: string): boolean {
  const t = v.trim();
  return t.length >= 2 && t.length <= 80 && /^[A-Za-zÀ-ÿÑñ\s'\-.]+$/.test(t);
}
export function formatPersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.split("-").map((p) => p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p).join("-"))
    .join(" ");
}
export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
export function sanitizeNoteInput(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s{3,}/g, "  ")
    .slice(0, MAX_NOTES);
}

export function rawResourceToResource(r: import("./types").RawResourceRow): import("./types").Resource {
  return {
    id: r.id, name: r.name, type: r.type ?? "room", capacity: r.capacity ?? null,
    hourly_rate: r.hourly_rate != null ? Number(r.hourly_rate) : null,
    nightly_rate: r.nightly_rate != null ? Number(r.nightly_rate) : null,
    branch_id: r.branch_id ?? null,
  };
}

export function rawBookingToBooking(b: import("./types").RawBookingRow): Booking {
  return {
    id: b.id, resource_id: b.resource_id,
    branch_id: b.branch_id ?? null,
    resource_name: b.bookable_resources?.name ?? null,
    start_time: b.start_time, end_time: b.end_time,
    status: b.status,
    payment_status: (b.payment_status ?? "unpaid") as Booking["payment_status"],
    total: Number(b.total), amount_paid: Number(b.amount_paid ?? 0), notes: b.notes ?? null,
    hold_expires_at: b.hold_expires_at ?? null,
    checked_in_at: b.checked_in_at ?? null,
  };
}
