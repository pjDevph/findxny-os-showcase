// CORS + JSON helpers.
//
// Origin policy: if ALLOWED_ORIGINS env is set (comma-separated), we echo the
// request's Origin only when it matches one of the entries (exact match or a
// `*.domain.tld` wildcard). When unset, we fall back to `*` — preserves the
// historical behavior for environments that haven't configured the allowlist.

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function originAllowed(origin: string | null): string {
  if (ALLOWED.length === 0) return "*";
  if (!origin) return ALLOWED[0]; // no Origin header → safe default
  for (const pattern of ALLOWED) {
    if (pattern === origin) return origin;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // ".domain.tld"
      if (origin.endsWith(suffix)) return origin;
    }
  }
  return ALLOWED[0]; // not allowed → echo our canonical origin, browser will block
}

export function corsFor(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": originAllowed(req.headers.get("Origin")),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

// Kept as a const for callers that don't have a request handy (e.g. logging
// glue). Uses the wildcard fallback regardless of env.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", ...extraHeaders },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  return null;
}
