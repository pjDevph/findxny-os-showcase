// Helpers for safely building PostgREST filter-DSL strings (the argument to
// supabase-js's `.or()`) from user-controlled text. PostgREST parses that
// string as `column.operator.value,column.operator.value,...`, so a raw
// value containing `,`, `(` or `)` can add/rearrange conditions within the
// `.or()` group. Chained filters (e.g. `.eq("workspace_id", wsId)`) are sent
// as separate, ANDed query params, so this can't escape those — but any
// free-text value interpolated into an `.or()`/`.ilike()` string should still
// go through this first as defense-in-depth.
const DANGEROUS_CHARS = /[,().]/g;

/** Strip PostgREST filter-DSL metacharacters before interpolating into `.or()`. */
export function sanitizeIlikeText(raw: string): string {
  return raw.replace(DANGEROUS_CHARS, "");
}

/** Build a `%...%` ILIKE pattern from user text, safe to interpolate into `.or()`. */
export function ilikePattern(raw: string): string {
  return `%${sanitizeIlikeText(raw)}%`;
}
