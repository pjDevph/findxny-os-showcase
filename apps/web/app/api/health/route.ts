// Liveness/readiness probe. Pings the database via an anon-key read so it
// covers both the Next.js process and the Supabase REST gateway.
// Intentionally light — no auth, cheap query, short timeout.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3_000;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ status: "error", error: "supabase env not configured" }, { status: 500 });
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const sb = createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, signal: ctrl.signal }) } });
    const { error } = await sb.from("workspaces").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({
      status: "ok",
      uptime_ms: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "db unreachable" },
      { status: 503 },
    );
  } finally {
    clearTimeout(t);
  }
}
