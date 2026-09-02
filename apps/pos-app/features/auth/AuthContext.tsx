import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, invokeFn, clearPersistedAuthSession } from "../../services/supabase";
import { getIsConnected } from "../offline/networkStatus";

export const DEVICE_WORKSPACE_KEY = "pos_device_workspace";

// Cached copy of the last-resolved membership set, keyed to the signed-in
// user so a returning offline session can restore role/workspace/branch
// instead of hanging at null forever (loadMemberships' network call can't
// run offline, and there was previously no fallback at all — see below).
const DEVICE_IDENTITY_KEY = "pos_device_identity_v1";

interface CachedIdentity {
  userId: string;
  memberships: Membership[];
  activeWorkspaceId: string | null;
  activeBranchId: string | null;
}

// Read-side offline caches, keyed per workspace (not per user — a POS device
// stays pinned to one workspace regardless of who's signed in). Cleared on
// every sign-out so a shared terminal always starts the next session with a
// clean slate instead of silently restoring whatever the previous cashier
// last viewed offline. Sign-in itself always requires a live network call
// (see login.tsx/signIn), so by the time anyone signs back in — same person
// or not — a fresh fetch is possible anyway; nothing offline-only is lost.
// Must stay in sync with the cache-key prefixes defined in:
//   features/transactions/useTransactionsList.ts   (pos_transactions_cache_v1_)
//   features/transactions/useTransactionDetail.ts  (pos_tx_detail_cache_v1_)
//   app/pos/receipts.tsx                            (pos_receipts_cache_v1_, pos_receipts_detail_cache_v1_)
//   features/settings/useWorkspaceSettings.ts       (pos_settings_workspace_v1_)
const WORKSPACE_CACHE_PREFIXES = [
  "pos_transactions_cache_v1_",
  "pos_tx_detail_cache_v1_",
  "pos_receipts_cache_v1_",
  "pos_receipts_detail_cache_v1_",
  "pos_settings_workspace_v1_",
];

async function clearWorkspaceReadCaches(workspaceId: string | null): Promise<void> {
  if (!workspaceId) return;
  await Promise.all(
    WORKSPACE_CACHE_PREFIXES.map((prefix) => AsyncStorage.removeItem(`${prefix}${workspaceId}`).catch(() => {})),
  );
}

type WorkspaceRole = "owner" | "admin" | "manager" | "cashier" | "kitchen";

interface Membership {
  workspace_id: string;
  role: WorkspaceRole;
  branch_id: string | null;
  workspace_name: string;
}

interface WorkspaceMemberRow {
  workspace_id: string;
  role: WorkspaceRole;
  branch_id: string | null;
  // PostgREST returns an embedded to-one relationship (workspace_members.workspace_id
  // -> workspaces.id) as a single object, not an array — the array-shaped type here
  // was wrong, which made `r.workspaces?.[0]?.name` below always undefined. Every
  // consumer of memberships[].workspace_name (receipts.tsx, and reprints anywhere
  // else that resolve the store name this way) has been silently falling back to
  // "POS"/"" this whole time as a result.
  workspaces: { name: string } | null;
}

interface AuthFirstBranchResult {
  "auth-first-branch": { id: string } | null;
}

// Raw supabase-js calls (supabase.from/.auth.*) have no built-in timeout —
// unlike invokeFn's edge-function calls, which are wrapped with an 8s abort.
// Against a connection that's technically "online" (radio up) but actually
// dead past that point (blocked port, captive portal, stalled route), a raw
// call can hang for however long the OS's own TCP retry logic takes — tens
// of seconds to minutes — long after invokeFn-based calls would have failed
// and fallen back to cache. Race it against the same 8s bound so those
// fallbacks (see loadMemberships/signOut below) actually kick in promptly.
function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms)),
  ]);
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** Current user's display name (profiles.full_name), for receipts/tickets. Falls back to email if no profile name is set. */
  userName: string | null;
  memberships: Membership[];
  activeWorkspaceId: string | null;
  activeBranchId: string | null;
  // False while activeBranchId is still resolving in the background (owner/
  // manager accounts aren't pinned to a branch, so this needs an extra
  // awaited network call after loading already flips false — see
  // loadMemberships). Branch-scoped screens should wait for this before
  // firing their first fetch, or they'll silently query with no branch_id.
  branchResolved: boolean;
  role: WorkspaceRole | null;
  setActiveWorkspace: (workspaceId: string, branchId?: string | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branchResolved, setBranchResolved] = useState(false);

  useEffect(() => {
    let settled = false;
    const stopLoading = () => { if (!settled) { settled = true; setLoading(false); } };

    // Drive loading off onAuthStateChange rather than getSession(): the first
    // event (INITIAL_SESSION) delivers the persisted session WITHOUT awaiting a
    // network token refresh, so the splash never hangs when Supabase is slow or
    // unreachable. Memberships load in the background and must not block the UI.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) { void loadMemberships(s.user.id); void loadUserName(s.user.id, s.user.email ?? null); }
      else { setMemberships([]); setActiveWorkspaceId(null); setActiveBranchId(null); setBranchResolved(true); setUserName(null); }
      stopLoading();
    });

    // Safety net: if the auth client never emits an event, don't spin forever.
    const timer = setTimeout(stopLoading, 8000);

    return () => { clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, []);

  async function loadUserName(userId: string, fallbackEmail: string | null) {
    try {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      setUserName(data?.full_name || fallbackEmail);
    } catch {
      setUserName(fallbackEmail);
    }
  }

  async function loadMemberships(userId: string) {
    setBranchResolved(false);
    try {
      // Auth-context exception: direct read to resolve which workspaces this user
      // belongs to — we have no workspace_id yet to call pos-data with.
      const { data: raw, error: readErr } = await withTimeout(Promise.resolve(supabase
        .from("workspace_members")
        .select("workspace_id, role, branch_id, workspaces(name)")
        .eq("user_id", userId)));
      if (readErr) throw readErr;
      // supabase-js's default type inference for the embedded `workspaces(name)`
      // resource assumes a to-many relationship (array) since this client isn't
      // wired to generated Database types — cast to what PostgREST actually
      // returns for this to-one FK (a single object, confirmed against the live
      // response shape), rather than the client's incorrect default guess.
      const rows = ((raw ?? []) as unknown as WorkspaceMemberRow[]).map((r) => ({
        workspace_id: r.workspace_id,
        role: r.role as WorkspaceRole,
        branch_id: r.branch_id,
        workspace_name: r.workspaces?.name ?? "",
      }));
      setMemberships(rows);
      let resolvedWorkspaceId = activeWorkspaceId;
      let resolvedBranchId = activeBranchId;
      if (rows.length && !activeWorkspaceId) {
        const ws = rows[0];
        resolvedWorkspaceId = ws.workspace_id;
        setActiveWorkspaceId(ws.workspace_id);
        AsyncStorage.setItem(DEVICE_WORKSPACE_KEY, ws.workspace_id).catch(() => {});
        if (ws.branch_id) {
          resolvedBranchId = ws.branch_id;
          setActiveBranchId(ws.branch_id);
        } else {
          // Owner/manager not pinned to a branch — auto-pick the first branch.
          // Branch-scoped screens must wait for branchResolved before their
          // first fetch, or this awaited call loses the race against them.
          const { data: branchResult } = await invokeFn<AuthFirstBranchResult>("pos-data", {
            workspace_id: ws.workspace_id,
            resource: "auth-first-branch",
            params: { workspace_id: ws.workspace_id },
          });
          resolvedBranchId = branchResult?.["auth-first-branch"]?.id ?? null;
          setActiveBranchId(resolvedBranchId);
        }
      }
      const cached: CachedIdentity = { userId, memberships: rows, activeWorkspaceId: resolvedWorkspaceId, activeBranchId: resolvedBranchId };
      AsyncStorage.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(cached)).catch(() => {});
    } catch {
      // Network unreachable (or the read itself failed) — this used to leave
      // memberships/activeWorkspaceId/role stuck at their initial null/[]
      // forever, which hid every role-gated nav item (including Settings)
      // and made a directly-opened Settings screen spin forever. Restore
      // whatever was last resolved for this same user while they were
      // online, so a returning offline session isn't locked out of the app.
      try {
        const raw = await AsyncStorage.getItem(DEVICE_IDENTITY_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as CachedIdentity;
          if (cached.userId === userId) {
            setMemberships(cached.memberships);
            setActiveWorkspaceId(cached.activeWorkspaceId);
            setActiveBranchId(cached.activeBranchId);
          }
        }
      } catch { /* corrupt cache — nothing to restore */ }
    } finally {
      setBranchResolved(true);
    }
  }

  const role = memberships.find((m) => m.workspace_id === activeWorkspaceId)?.role ?? null;

  const value: AuthState = useMemo(() => ({
    loading,
    session,
    user: session?.user ?? null,
    userName,
    memberships,
    activeWorkspaceId,
    activeBranchId,
    branchResolved,
    role,
    setActiveWorkspace: (wid, bid) => { setActiveWorkspaceId(wid); setActiveBranchId(bid ?? null); setBranchResolved(true); },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      // Always clear the shared device's read-side offline caches on the way
      // out, regardless of whether the network revoke below succeeds — see
      // clearWorkspaceReadCaches' doc for why this doesn't cost anything.
      clearWorkspaceReadCaches(activeWorkspaceId).catch(() => {});
      // supabase.auth.signOut() always tries a server-side revoke first (even
      // with scope:"local") and only clears the persisted session once that
      // call resolves — a genuine network failure means it returns early and
      // the cashier stays signed in with no visible error (see
      // clearPersistedAuthSession's doc). Skip the network attempt outright
      // when offline, and fall back to a forced local clear if an attempt
      // while "online" still fails (a flaky connection can drop mid-call).
      //
      // getIsConnected() is a device-radio signal (NetInfo) — it can read
      // true while the actual path to Supabase is dead (a port blocked
      // downstream, a captive portal, a stalled connection), and unlike
      // invokeFn(), supabase.auth.signOut() has no built-in timeout, so that
      // combination previously hung "Sign out" forever with no way out.
      // Race it against a timeout, same 8s bound invokeFn uses elsewhere.
      if (getIsConnected()) {
        try { await withTimeout(supabase.auth.signOut()); return; } catch { /* fall through to local clear below */ }
      }
      await clearPersistedAuthSession();
      await AsyncStorage.removeItem(DEVICE_IDENTITY_KEY).catch(() => {});
      setSession(null);
      setMemberships([]);
      setActiveWorkspaceId(null);
      setActiveBranchId(null);
      setBranchResolved(true);
      setUserName(null);
    },
  }), [loading, session, userName, memberships, activeWorkspaceId, activeBranchId, branchResolved, role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
