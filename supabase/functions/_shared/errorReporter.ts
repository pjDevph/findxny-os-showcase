// Lightweight Sentry reporter for Deno edge functions.
//
// Why not @sentry/deno? It pulls a sizeable runtime; we don't need breadcrumbs,
// performance traces, or replays — just "send me unhandled errors". The Sentry
// HTTP envelope endpoint accepts a single POST with a tiny JSON event, which
// is what this file does. No-ops when SENTRY_DSN is unset, so dev/test
// environments stay quiet.
//
// Configure by setting SENTRY_DSN as a function secret:
//   supabase secrets set SENTRY_DSN=https://abc@xyz.ingest.sentry.io/123

const DSN = Deno.env.get("SENTRY_DSN") ?? "";
const ENV = Deno.env.get("APP_ENV") ?? "production";
const RELEASE = Deno.env.get("RELEASE") ?? "";

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  // Sentry DSN format: https://<publicKey>@<host>/<projectId>
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId) return null;
    return {
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      publicKey: u.username,
    };
  } catch {
    return null;
  }
}

const parsed = DSN ? parseDsn(DSN) : null;

export interface ReportContext {
  /** Request URL or function name. */
  endpoint?: string;
  /** Authenticated user id, if available. */
  userId?: string;
  /** Arbitrary tags (workspace_id, action, etc.). */
  tags?: Record<string, string>;
  /** Extra structured context. */
  extra?: Record<string, unknown>;
}

export async function reportError(err: unknown, ctx: ReportContext = {}): Promise<void> {
  if (!parsed) return; // Sentry not configured — no-op.

  const error = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    environment: ENV,
    ...(RELEASE ? { release: RELEASE } : {}),
    level: "error",
    logger: "edge-function",
    tags: ctx.tags ?? {},
    user: ctx.userId ? { id: ctx.userId } : undefined,
    extra: { endpoint: ctx.endpoint, ...ctx.extra },
    exception: {
      values: [{
        type: error.name,
        value: error.message,
        stacktrace: error.stack ? { frames: parseStack(error.stack) } : undefined,
      }],
    },
  };

  // Sentry envelope auth header. Fire-and-forget — never throw from a reporter.
  const auth = [
    "Sentry sentry_version=7",
    `sentry_key=${parsed.publicKey}`,
    "sentry_client=findxny-edge/1.0",
  ].join(", ");

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2_000);
    await fetch(parsed.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Sentry-Auth": auth },
      body: JSON.stringify(event),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch {
    // Reporter failure must never escape — log locally and move on.
    console.error("sentry report failed", error.message);
  }
}

function parseStack(stack: string): Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> {
  // Best-effort V8 stack parsing. Sentry will still display unparsed frames.
  return stack.split("\n").slice(1).map((line) => {
    const m = /at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?/.exec(line.trim()); // NOSONAR - applied to controlled internal data
    if (!m) return { function: line.trim() };
    return { function: m[1] ?? "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) };
  }).reverse(); // Sentry expects oldest-first
}
