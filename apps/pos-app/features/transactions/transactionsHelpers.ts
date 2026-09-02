import { useTheme } from "../theme/ThemeContext";
import { phDateStr, phMonthStartDateStr, phStartOfDayIso } from "../utils/phDate";
import { PAYMENT_METHOD_LABELS, type DateFilter, type Order, type OrderItem } from "./types";
import { peso } from "../order/format";

export function rangeStart(f: DateFilter): string | null {
  if (f === "today") return phStartOfDayIso(phDateStr(0));
  if (f === "week") return phStartOfDayIso(phDateStr(-6));
  if (f === "month") return phStartOfDayIso(phMonthStartDateStr());
  return null;
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// Offline-queued orders get a random temp number (TMP-xxxxxx — see
// orderHelpers.ts's tempNo) that's never meant to be shortened: the digit-
// suffix regex below was built for real sequential order numbers, and a
// random alphanumeric suffix has roughly 1-in-10 odds of happening to end in
// a digit — e.g. "TMP-FD2DF4" was displaying as "#0004", indistinguishable
// from (and potentially colliding with) a real synced order's number.
export const shortNo = (no: string) => {
  if (no.startsWith("TMP-")) return no;
  const m = no.match(/(\d+)$/); return m ? `#${m[1].padStart(4, "0")}` : no;
};

export function statusColor(s: string, C: ReturnType<typeof useTheme>["C"]) {
  if (s === "completed") return C.good;
  if (s === "cancelled") return C.bad;
  return C.warn;
}

export function sourceColor(s: string | null | undefined): string {
  if (s === "web") return "#3b82f6";
  if (s === "kiosk") return "#22c55e";
  return "#d09030";
}

export function hasMismatch(order: Order, items: OrderItem[]) {
  if (!items.length) return false;
  const itemsSum = items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  return Math.abs(itemsSum - Number(order.subtotal ?? itemsSum)) > 0.05;
}

export function guestName(order: Order): string {
  if (!order.notes) return "";
  return order.notes.startsWith("Guest: ") ? order.notes.slice(7) : order.notes;
}

export function paymentMethodLabel(methods: { method: string; amount: number }[] | undefined | null): string {
  if (!methods || methods.length === 0) return "—";
  return methods
    .map(m => `${PAYMENT_METHOD_LABELS[m.method] ?? m.method} ${peso(m.amount)}`)
    .join(" + ");
}
