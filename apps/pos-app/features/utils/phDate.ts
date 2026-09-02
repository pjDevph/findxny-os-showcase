/**
 * Philippines-timezone (Asia/Manila, UTC+8) day-boundary helpers — mirrors
 * supabase/functions/_shared/dates.ts so client-computed "today"/"this week"
 * date ranges agree with the server regardless of the device's own OS
 * timezone setting (a device left on a non-PH timezone previously produced
 * a "today" that didn't match what the backend considered today).
 */
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

/** YYYY-MM-DD for "today" in Asia/Manila, regardless of device timezone. */
export function phDateStr(offsetDays = 0): string {
  const nowPh = new Date(Date.now() + PH_OFFSET_MS);
  nowPh.setUTCDate(nowPh.getUTCDate() + offsetDays);
  return nowPh.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for the 1st of the current Asia/Manila month. */
export function phMonthStartDateStr(): string {
  const nowPh = new Date(Date.now() + PH_OFFSET_MS);
  const y = nowPh.getUTCFullYear();
  const m = nowPh.getUTCMonth();
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** ISO instant for 00:00:00 Asia/Manila on the given YYYY-MM-DD date string. */
export function phStartOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+08:00`).toISOString();
}

/** ISO instant for 23:59:59 Asia/Manila on the given YYYY-MM-DD date string. */
export function phEndOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59+08:00`).toISOString();
}
