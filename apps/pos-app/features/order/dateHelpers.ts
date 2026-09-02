/**
 * Local date/time helpers for the order + booking flows.
 *
 * Extracted from app/pos/order.tsx. Deliberately device-local (not UTC-shifted)
 * — these feed date/time pickers the cashier reads on screen.
 */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function nowHour() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}
export function buildISO(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}
export function addHoursISO(iso: string, hrs: number) {
  return new Date(new Date(iso).getTime() + hrs * 3600_000).toISOString();
}
