// Minimal Sentry reporter for Next.js — same idea as the edge-function version
// in supabase/functions/_shared/errorReporter.ts. We post one event over HTTP
// rather than pulling @sentry/nextjs, which would add ~250KB to client bundles
// and require build-time integration. No-ops when SENTRY_DSN is unset.
//
// Configure:
//   SENTRY_DSN=https://abc@xyz.ingest.sentry.io/123          (server-side)
//   NEXT_PUBLIC_SENTRY_DSN=https://...                       (browser)

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId) return null;
    return { endpoint: `${u.protocol}//${u.host}/api/${projectId}/store/`, publicKey: u.username };
  } catch {
    return null;
  }
}

function dsn(): ParsedDsn | null {
  const value = typeof window === "undefined"
    ? process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
    : process.env.NEXT_PUBLIC_SENTRY_DSN;
  return value ? parseDsn(value) : null;
}

const ENV = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "production";
const RELEASE = process.env.NEXT_PUBLIC_RELEASE ?? "";

export interface ReportContext {
  endpoint?: string;
  userId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export async function reportError(err: unknown, ctx: ReportContext = {}): Promise<void> {
  const parsed = dsn();
  if (!parsed) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    environment: ENV,
    ...(RELEASE ? { release: RELEASE } : {}),
    level: "error",
    logger: typeof window === "undefined" ? "next-server" : "next-browser",
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

  const auth = [
    "Sentry sentry_version=7",
    `sentry_key=${parsed.publicKey}`,
    "sentry_client=findxny-web/1.0",
  ].join(", ");

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2_000);
    await fetch(parsed.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Sentry-Auth": auth },
      body: JSON.stringify(event),
      signal: ctrl.signal,
      // Browser: don't block page unload on reporter.
      keepalive: typeof window !== "undefined",
    });
    clearTimeout(t);
  } catch {
    // Reporter failure is never fatal.
  }
}

function parseStack(stack: string): Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> {
  return stack.split("\n").slice(1).map((line) => {
    const m = /at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?/.exec(line.trim()); // NOSONAR - applied to controlled internal data
    if (!m) return { function: line.trim() };
    return { function: m[1] ?? "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) };
  }).reverse();
}
