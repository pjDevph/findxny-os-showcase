// Re-exported from the single shared source of truth (also imported directly
// by the pos-data edge function) so client and server can never drift apart
// on page sizes — a mismatch silently truncates a screen's list.
export { PAGE_SIZES } from "../../../supabase/functions/_shared/pagination.ts";
export const WRITE_ROLES = ["owner", "admin", "manager"] as const;
