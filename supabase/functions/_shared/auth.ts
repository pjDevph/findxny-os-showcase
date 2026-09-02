import { adminClient, userClient } from "./supabaseClient.ts";
import { Forbidden, Unauthorized } from "./errors.ts";

export type WorkspaceRole = "owner" | "admin" | "manager" | "cashier" | "kitchen";

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  authHeader: string;
}

/**
 * Per-isolate cache of verified (JWT, workspace) -> {userId, role}.
 *
 * requireAuth() runs on every edge function call and normally costs two
 * network round trips (GoTrue getUser() + a workspace_members query) before
 * any real work starts. Deno Deploy keeps an isolate warm across rapid
 * requests from the same client (e.g. a cashier tapping through checkout),
 * so caching the verified result for a short window skips both round trips
 * on cache hits while still fully re-verifying at least once per window.
 * Worst case on a revoked session/role change is a TTL-bounded staleness
 * window, well inside a JWT's normal lifetime.
 */
const AUTH_CACHE_TTL_MS = 30_000;
const AUTH_CACHE_MAX_ENTRIES = 500;
const authCache = new Map<string, { userId: string; role: WorkspaceRole; expiresAt: number }>();

function cacheKey(authHeader: string, workspaceId: string): string {
  return `${workspaceId}:${authHeader}`;
}

function pruneAuthCacheIfNeeded(): void {
  if (authCache.size < AUTH_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(key);
  }
  // Still over budget (e.g. a burst of distinct callers) — drop the oldest entries.
  if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
    const excess = authCache.size - AUTH_CACHE_MAX_ENTRIES + 1;
    let dropped = 0;
    for (const key of authCache.keys()) {
      if (dropped >= excess) break;
      authCache.delete(key);
      dropped++;
    }
  }
}

/** Validate JWT, ensure caller is a member of the given workspace. */
export async function requireAuth(
  req: Request,
  workspaceId: string,
): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw Unauthorized("Missing Authorization header");

  const key = cacheKey(authHeader, workspaceId);
  const cached = authCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: cached.userId, workspaceId, role: cached.role, authHeader };
  }

  const supabase = userClient(authHeader);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    // 4xx ApiErrors are never sent to Sentry (see handleError), so without this
    // log there is zero trail of *why* a session was rejected — expired vs.
    // malformed vs. revoked all looked identical as "Invalid session".
    console.error("requireAuth: getUser() rejected token", userErr?.message ?? "no user in response");
    throw Unauthorized("Invalid session");
  }

  const admin = adminClient();
  const { data: member, error: memberErr } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (memberErr) throw Unauthorized(memberErr.message);
  if (!member) throw Forbidden("Not a member of this workspace");

  const role = member.role as WorkspaceRole;
  pruneAuthCacheIfNeeded();
  authCache.set(key, { userId: userData.user.id, role, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });

  return {
    userId: userData.user.id,
    workspaceId,
    role,
    authHeader,
  };
}

export function requireRole(ctx: AuthContext, allowed: WorkspaceRole[]): void {
  if (!allowed.includes(ctx.role)) {
    throw Forbidden(`Role '${ctx.role}' not allowed; needs one of [${allowed.join(", ")}]`);
  }
}

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

/**
 * Gate for functions whose only legitimate caller is pg_cron (via
 * net.http_post), which can't present a user/anon Supabase JWT worth
 * verifying. Requires an `x-cron-secret` header matching CRON_SECRET.
 * Fails closed if the secret isn't configured.
 */
export function requireCronSecret(req: Request): void {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    throw Unauthorized("Invalid or missing cron secret");
  }
}
