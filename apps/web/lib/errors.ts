/**
 * Extract a friendly message from any thrown error or edge-function response.
 * Edge functions return `{ error: { code, message } }` — that's what we surface.
 * Falls back to `.message`, then a generic string.
 *
 * Use this anywhere we display an error to the user (form submission, save,
 * delete, fetch). Don't show raw `err.message` directly — most edge-function
 * errors are JSON-wrapped and look like gibberish to a non-developer.
 */
/**
 * Supabase's `functions.invoke()` returns a FunctionsHttpError whose `.message`
 * is only the generic "Edge Function returned a non-2xx status code" — the real
 * error body lives in `err.context` (a Response). Callers that invoke directly
 * (instead of through admin-api's `invoke()`) must run the error through this so
 * the actual reason reaches `extractErrMsg`. Returns an Error whose message
 * embeds the JSON body, matching the format extractErrMsg already parses.
 */
export async function withFnBody(err: unknown): Promise<unknown> {
  const ctx = (err as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } })?.context;
  if (!ctx) return err;
  try {
    let body: unknown = null;
    if (ctx.json) body = await ctx.json();
    else if (ctx.text) body = await ctx.text();
    if (body) {
      const base = (err as { message?: string }).message ?? "";
      const detail = typeof body === "string" ? body : JSON.stringify(body);
      return new Error(`${base} — ${detail}`);
    }
  } catch { /* fall through to original error */ }
  return err;
}

export function extractErrMsg(err: unknown): string {
  if (!err) return "Something went wrong.";
  if (typeof err === "string") return prettify(err);

  const e = err as { message?: string; error?: { message?: string } };

  // 1. Edge functions wrap their response body inside `err.message` after the
  //    `: — { ... }` pattern from invoke(). Pull the JSON out.
  const raw = e.message ?? "";
  const m = /\{[\s\S]*\}/.exec(raw); // NOSONAR - applied to controlled internal data
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      const inner = j?.error?.message ?? j?.message;
      if (inner) return prettify(String(inner));
    } catch { /* fall through */ }
  }

  // 2. Nested error.message on the thrown object.
  if (e.error?.message) return prettify(e.error.message);

  // 3. Plain message.
  if (raw) return prettify(raw);

  return "Something went wrong.";
}

function prettify(msg: string): string {
  // Strip leading "function-name: " prefix from the invoke wrapper
  let s = msg.replace(/^[a-z][\w-]*:\s+/i, "").trim();
  // Common DB / RLS messages → friendlier text
  if (/permission denied|not allowed|forbidden/i.test(s)) return "You don't have permission to do this.";
  if (/duplicate key|unique constraint/i.test(s))         return "That item already exists.";
  if (/foreign key|violates foreign key/i.test(s))        return "This item is in use elsewhere and can't be removed.";
  if (/not found/i.test(s))                                return "We couldn't find that item — it may have been removed.";
  if (/network|fetch failed|timeout/i.test(s))             return "Connection problem. Check your internet and try again.";
  const notNull = /null value in column "(\w+)"/i.exec(s);
  if (notNull) {
    const label = notNull[1].replace(/_id$/, "").replace(/_/g, " ");
    return `${label.charAt(0).toUpperCase() + label.slice(1)} is required.`;
  }
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.replace(/\.+$/, "."); // NOSONAR - applied to controlled internal data
}
