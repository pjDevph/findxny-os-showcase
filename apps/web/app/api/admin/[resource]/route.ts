// Server-side proxy so client components can read admin data without
// touching the database directly. Forwards the user's session cookie to
// `admin-data` and returns the JSON response unchanged.
import { NextResponse, type NextRequest } from "next/server";
import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";

const ALLOWED = new Set([
  "context", "dashboard", "orders", "kitchen", "bookings",
  "branches", "employees", "transactions", "reports",
  "audit-logs", "products", "inventory", "ingredients",
]);

// Per-resource param whitelist. Any key not listed here is dropped before
// reaching the edge function. This caps the attack surface of the proxy.
const PARAM_WHITELIST: Record<string, Set<string>> = {
  orders:        new Set(["limit", "offset", "status", "branch", "source"]),
  bookings:      new Set(["limit", "offset", "status"]),
  transactions:  new Set(["limit", "offset", "type", "status"]),
  "audit-logs":  new Set(["limit", "offset", "entity_type", "since"]),
  reports:       new Set(["days"]),
  ingredients:   new Set(["include_archived"]),
  inventory:     new Set([]),
  products:      new Set([]),
  branches:      new Set([]),
  employees:     new Set([]),
  context:       new Set([]),
  dashboard:     new Set([]),
  kitchen:       new Set([]),
};

export async function GET(req: NextRequest, { params }: { params: { resource: string } }) {
  if (!ALLOWED.has(params.resource)) {
    return NextResponse.json({ error: "unknown resource" }, { status: 404 });
  }
  const wsId = await resolveWorkspaceId();
  if (!wsId) return NextResponse.json({ error: "no workspace" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const allowed = PARAM_WHITELIST[params.resource] ?? new Set<string>();
  const extra: Record<string, string> = {};
  sp.forEach((v, k) => { if (allowed.has(k)) extra[k] = v; });

  try {
    const fn = (adminApi as any)[
      params.resource === "audit-logs" ? "auditLogs" : params.resource
    ] as (wsId: string, p?: any) => Promise<unknown>;
    const data = await fn(wsId, extra);
    // Per-workspace admin data must never be cached by a shared cache/CDN.
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "failed" }, { status: 500 });
  }
}
