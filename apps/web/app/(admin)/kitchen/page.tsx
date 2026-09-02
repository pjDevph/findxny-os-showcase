"use client";

import { useEffect, useState, useCallback, useRef, useReducer } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { adminClient } from "@/lib/admin-client";
import { RefreshButton } from "@/components/ui/RefreshButton";

// ─── Types ────────────────────────────────────────────────────────────────────

type KitchenItem = {
  quantity: number;
  notes: string | null;
  name: string;
};

interface KitchenTicket {
  id: string;
  kitchen_status: "new" | "accepted" | "preparing" | "ready" | "served" | "completed";
  station: string | null;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  order_id: string;
  orders: {
    order_no: string;
    table_no: string | null;
    source: string | null;
    customers: { name: string } | null;
  } | null;
  kitchen_ticket_items: { order_items: { quantity: number; notes: string | null; products: { name: string } | null } | null }[];
}

type HistoryTicket = {
  id: string;
  kitchen_status: string;
  station: string | null;
  completed_at: string | null;
  created_at: string;
  orders: {
    order_no: string;
    table_no: string | null;
    customers: { name: string } | null;
  } | null;
  kitchen_ticket_items: { order_items: { quantity: number; notes: string | null; products: { name: string } | null } | null }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

type StationFilter = "all" | "kitchen" | "drinks" | "counter";
type SourceFilter  = "all" | "pos" | "web" | "kiosk";

const STATIONS: { id: StationFilter; label: string; emoji: string; color: string; bg: string }[] = [
  { id: "all",     label: "All",     emoji: "",   color: "var(--amber-bright)", bg: "rgba(var(--tint-rgb), 0.12)" },
  { id: "kitchen", label: "Kitchen", emoji: "🍳", color: "#f97316",             bg: "rgba(249,115,22,0.12)" },
  { id: "drinks",  label: "Drinks",  emoji: "🥤", color: "#3b82f6",             bg: "rgba(59,130,246,0.12)"  },
  { id: "counter", label: "Counter", emoji: "📦", color: "#22c55e",             bg: "rgba(34,197,94,0.12)"   },
];

const STATUS_NEXT: Record<string, string> = {
  new: "preparing", accepted: "preparing", preparing: "ready", ready: "completed",
};
const STATUS_LABEL: Record<string, string> = {
  new: "Start Prep", accepted: "Start Prep", preparing: "Mark Ready", ready: "Mark Served",
};
// Per-ticket badge text — collapsed to the same 3 buckets POS's kitchen board shows
// (apps/pos-app/app/pos/kitchen.tsx STATUS_MAP), so the same ticket reads identically
// on both screens instead of web showing the raw "accepted" enum value.
const STATUS_BADGE: Record<string, string> = {
  new: "New", accepted: "New", preparing: "Preparing", ready: "Ready",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stationMeta(id: string | null) {
  return STATIONS.find(s => s.id === id) ?? STATIONS[0];
}

function ticketItems(t: KitchenTicket | HistoryTicket): KitchenItem[] {
  return (t.kitchen_ticket_items ?? []).map(kti => ({
    quantity: kti.order_items?.quantity ?? 1,
    notes: kti.order_items?.notes ?? null,
    name: kti.order_items?.products?.name ?? "Item",
  }));
}

function elapsed(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function fmtElapsed(mins: number) {
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const tone = (freq: number, t: number, dur: number, vol = 0.35) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + t);
      gain.gain.setValueAtTime(vol, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + dur + 0.01);
    };
    tone(880, 0, 0.14); tone(1100, 0.18, 0.14); tone(1320, 0.36, 0.22);
  } catch {}
}

function usePref(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState<boolean>(() => {
    if (typeof window === "undefined") return def;
    const s = localStorage.getItem(key);
    return s === null ? def : s === "true";
  });
  const set = useCallback((v: boolean) => { localStorage.setItem(key, String(v)); setVal(v); }, [key]);
  return [val, set];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourcePill({ source }: { source: string | null | undefined }) {
  const src = source ?? "pos";
  const map: Record<string, { bg: string; text: string }> = {
    web:   { bg: "rgba(59,130,246,0.12)",  text: "#3b82f6" },
    kiosk: { bg: "rgba(34,197,94,0.12)",   text: "#22c55e" },
    pos:   { bg: "rgba(var(--tint-rgb), 0.12)",  text: "var(--amber-bright)" },
    qr:    { bg: "rgba(168,85,247,0.12)",  text: "#a855f7" },
  };
  const c = map[src] ?? map.pos;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 600, fontFamily: "var(--f-mono)", background: c.bg, color: c.text }}>
      {src.toUpperCase()}
    </span>
  );
}

function StationBadge({ station }: { station: string | null }) {
  if (!station || station === "none") return null;
  const m = stationMeta(station);
  return (
    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, fontFamily: "var(--f-mono)", background: m.bg, color: m.color }}>
      {m.emoji} {m.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KitchenPage() {
  const [tab, setTab]           = useState<"live" | "history">("live");
  const [tickets, setTickets]   = useState<KitchenTicket[]>([]);
  const [history, setHistory]   = useState<HistoryTicket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError]     = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const [stationFilter, setStationFilter] = useState<StationFilter>("all");
  const [sourceFilter,  setSourceFilter]  = useState<SourceFilter>("all");

  const [soundOn,    setSoundOn]    = usePref("mtm.kitchenSound",      true);
  const [autoAccept, setAutoAccept] = usePref("mtm.kitchenAutoAccept", false);
  const [posOnline,  setPosOnline]  = useState<boolean | null>(null);
  const [wsId,       setWsId]       = useState<string | null>(null);

  const rootRef       = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  const supabase      = useRef(supabaseBrowser()).current;
  const seenIds       = useRef(new Set<string>());
  const autoAcceptRef = useRef(autoAccept);
  const soundOnRef    = useRef(soundOn);

  useEffect(() => { autoAcceptRef.current = autoAccept; }, [autoAccept]);
  useEffect(() => { soundOnRef.current    = soundOn;    }, [soundOn]);

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  useEffect(() => {
    const id = setInterval(() => tick(), 60_000);
    return () => clearInterval(id);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.();
  }, []);

  const advance = useCallback(async (ticket: KitchenTicket) => {
    const next = STATUS_NEXT[ticket.kitchen_status];
    if (!next) return;
    setUpdating(ticket.id);
    try {
      const { error } = await supabase.functions.invoke("kitchen-update-status", {
        body: { ticket_id: ticket.id, status: next },
      });
      if (error) throw error;
    } catch (e: any) {
      window.dispatchEvent(new CustomEvent("mtm-toast", {
        detail: { msg: `Failed to update ticket: ${e?.message ?? "unknown error"}`, type: "info" },
      }));
    } finally {
      setUpdating(null);
    }
  }, [supabase]);

  const fetchTickets = useCallback(async () => {
    const res = await fetch("/api/admin/kitchen", { cache: "no-store" });
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    const incoming = (data.tickets ?? []) as KitchenTicket[];

    const newOnes = incoming.filter(t => !seenIds.current.has(t.id));
    if (newOnes.length > 0) {
      if (soundOnRef.current) playNotifSound();
      if (autoAcceptRef.current) {
        for (const t of newOnes.filter(t => t.kitchen_status === "new" || t.kitchen_status === "accepted")) {
          advance(t);
        }
      }
    }
    incoming.forEach(t => seenIds.current.add(t.id));
    setTickets(incoming);
    setLoading(false);
  }, [advance]);

  const fetchHistory = useCallback(async () => {
    setHistLoading(true); setHistError(null);
    try {
      const { memberships } = await adminClient.me();
      const id = memberships[0]?.workspace_id;
      if (!id) { setHistLoading(false); return; }
      const { tickets } = await adminClient.kitchenHistory(id, { limit: 50 });
      setHistory(tickets as unknown as HistoryTicket[]);
    } catch (e: any) {
      setHistError(e?.message ?? "Failed to load history");
    } finally {
      setHistLoading(false);
    }
  }, []);

  // Initial fetch on mount — runs immediately before wsId is known.
  useEffect(() => {
    fetchTickets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription — only created once wsId is available so the filter
  // is always set. Using wsId in the channel name avoids Supabase's client-side
  // dedup colliding with the previous unfiltered channel that was being torn down.
  useEffect(() => {
    if (!wsId) return;
    const ch = supabase
      .channel(`prep-display-${wsId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "kitchen_tickets",
        filter: `workspace_id=eq.${wsId}`,
      }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, wsId, fetchTickets]);

  // 30s fallback poll — a channel reporting SUBSCRIBED only means the websocket
  // handshake succeeded, not that Postgres is actually publishing change events
  // for this table (e.g. if kitchen_tickets isn't in the supabase_realtime
  // publication, subscribe() still resolves fine but no event ever arrives).
  // Poll unconditionally so this screen self-heals instead of going stale.
  useEffect(() => {
    const id = setInterval(() => { fetchTickets(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchTickets]);

  useEffect(() => {
    adminClient.me().then(({ memberships }) => {
      const id = memberships[0]?.workspace_id;
      if (id) setWsId(id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!wsId) return;
    const ch = supabase.channel(`pos-terminals:${wsId}`);
    const refresh = () => setPosOnline(Object.keys(ch.presenceState()).length > 0);
    ch.on("presence", { event: "sync" }, refresh)
      .on("presence", { event: "join" }, refresh)
      .on("presence", { event: "leave" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wsId, supabase]);

  useEffect(() => { if (tab === "history") fetchHistory(); }, [tab, fetchHistory]);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Station counts (over all tickets, independent of source filter)
  const stationCounts = STATIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s.id] = s.id === "all"
      ? tickets.length
      : tickets.filter(t => (t.station ?? "kitchen") === s.id).length;
    return acc;
  }, {});

  // Apply source filter first, then station filter
  const afterSource = sourceFilter === "all"
    ? tickets
    : tickets.filter(t => (t.orders?.source ?? "pos") === sourceFilter);

  const visibleTickets = stationFilter === "all"
    ? afterSource
    : afterSource.filter(t => (t.station ?? "kitchen") === stationFilter);

  const grouped = {
    new:       visibleTickets.filter(t => t.kitchen_status === "new" || t.kitchen_status === "accepted"),
    preparing: visibleTickets.filter(t => t.kitchen_status === "preparing"),
    ready:     visibleTickets.filter(t => t.kitchen_status === "ready"),
  };

  const cols: { key: keyof typeof grouped; label: string; color: string }[] = [
    { key: "new",       label: "Incoming",  color: "info" },
    { key: "preparing", label: "Preparing", color: "warn" },
    { key: "ready",     label: "Ready",     color: "ok"   },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} style={{ background: isFullscreen ? "#0a0705" : undefined }}>

      {/* ── Sticky top bar ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg-1)" }}>

        {posOnline === false && (
          <div style={{ background: "#78350f", color: "#fef3c7", padding: "9px 18px", fontSize: 13, display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #92400e" }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span><strong>No POS terminal online.</strong> Orders placed offline will sync automatically when the terminal reconnects.</span>
          </div>
        )}

        {/* ── Header ── */}
        <div className="admin-header">
          <div>
            <h1>Prep Display</h1>
            <div className="sub">{tab === "live" ? "Live ticket board · auto-refreshes via realtime" : "Completed tickets"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>

            {tab === "live" && cols.map(c => (
              <div key={c.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className={`pill ${c.color}`}>{grouped[c.key].length}</span>
                <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--f-mono)" }}>{c.label}</span>
              </div>
            ))}

            <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />

            <button className="btn-xs" onClick={() => setSoundOn(!soundOn)}
              style={soundOn ? { background: "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : { color: "var(--text-3)" }}>
              {soundOn ? "🔔 Sound On" : "🔕 Sound Off"}
            </button>
            <button className="btn-xs" onClick={() => setAutoAccept(!autoAccept)}
              style={autoAccept ? { background: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.35)", color: "#4ade80" } : { color: "var(--text-3)" }}>
              {autoAccept ? "⚡ Auto-start: On" : "⏸ Auto-start: Off"}
            </button>
            <button className="btn-xs" onClick={toggleFullscreen}
              style={isFullscreen ? { background: "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : undefined}>
              {isFullscreen ? "✕ Exit Fullscreen" : "⛶ Fullscreen"}
            </button>
            <RefreshButton onRefresh={fetchTickets} className="btn-xs" />

            <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />

            <div style={{ display: "flex", gap: 4 }}>
              {(["all", "pos", "web", "kiosk"] as SourceFilter[]).map(f => {
                const srcColor: Record<string, string> = { pos: "var(--amber-bright)", web: "#3b82f6", kiosk: "#22c55e" };
                const active = sourceFilter === f;
                return (
                  <button key={f} className="btn-xs" onClick={() => setSourceFilter(f)}
                    style={active ? { background: f === "all" ? "rgba(var(--tint-rgb), 0.12)" : `${srcColor[f]}1a`, borderColor: f === "all" ? "rgba(var(--tint-rgb), 0.4)" : `${srcColor[f]}66`, color: f === "all" ? "var(--amber-bright)" : srcColor[f] } : f !== "all" ? { color: srcColor[f], borderColor: `${srcColor[f]}44` } : {}}>
                    {f === "all" ? "All Sources" : f.toUpperCase()}
                  </button>
                );
              })}
            </div>

            <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />

            <div style={{ display: "flex", gap: 6 }}>
              <button className={`chip${tab === "live"    ? " active" : ""}`} onClick={() => setTab("live")}>Live</button>
              <button className={`chip${tab === "history" ? " active" : ""}`} onClick={() => setTab("history")}>History</button>
            </div>
          </div>
        </div>

        {/* ── Station tabs ── */}
        {tab === "live" && (
          <div style={{ display: "flex", borderBottom: "1px solid var(--line)", background: "var(--bg-2)", padding: "0 24px" }}>
            {STATIONS.map(s => {
              const active = stationFilter === s.id;
              const count  = stationCounts[s.id] ?? 0;
              return (
                <button key={s.id} onClick={() => setStationFilter(s.id)} style={{
                  padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
                  borderBottom: active ? `2px solid ${s.color}` : "2px solid transparent",
                  color: active ? s.color : "var(--text-3)",
                  fontWeight: active ? 700 : 500, fontSize: 13,
                  display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s",
                }}>
                  {s.emoji && <span>{s.emoji}</span>}
                  {s.label}
                  {count > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, borderRadius: 9,
                      background: active ? s.color : "var(--surface-2)",
                      color: active ? "#fff" : "var(--text-3)",
                      fontSize: 10, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--f-mono)", padding: "0 4px",
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Auto-accept hint */}
        {tab === "live" && autoAccept && (
          <div style={{ padding: "8px 24px", background: "rgba(74,222,128,0.06)", borderBottom: "1px solid rgba(74,222,128,0.15)", fontSize: 12, color: "#4ade80" }}>
            ⚡ Auto-start is <strong>on</strong> — incoming orders skip &quot;Start Prep&quot; and go straight to Preparing.
          </div>
        )}

        {/* ── Column headers — gap:0, border separators align with board columns ── */}
        {tab === "live" && !loading && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, background: "var(--bg-1)", borderBottom: "2px solid var(--line)" }}>
            {cols.map((col, i) => (
              <div key={col.key} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 20px",
                borderRight: i < cols.length - 1 ? "1px solid var(--line)" : undefined,
              }}>
                <span className={`pill ${col.color}`}><span className="dot" />{col.label}</span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{grouped[col.key].length} ticket{grouped[col.key].length !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Live Board — independently scrolling columns ── */}
      {tab === "live" && (
        <div>
          {loading && (
            <div style={{ textAlign: "center", color: "var(--text-3)", padding: 48, fontFamily: "var(--f-mono)" }}>Loading prep queue…</div>
          )}
          {!loading && (
            <div className="kitchen-board" style={{ gap: 0, alignItems: "start" }}>
              {cols.map((col, colIdx) => {
                const colTickets = grouped[col.key];
                return (
                  <div key={col.key} style={{
                    height: "calc(100dvh - 175px)",
                    overflowY: "auto",
                    borderRight: colIdx < cols.length - 1 ? "1px solid var(--line)" : undefined,
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px 24px" }}>
                      {colTickets.length === 0 && (
                        <div style={{ padding: "32px 16px", border: "1px dashed var(--line)", borderRadius: 12, textAlign: "center", color: "var(--text-3)", fontSize: 13, fontFamily: "var(--f-mono)" }}>Empty</div>
                      )}
                      {colTickets.map(t => {
                        const visibleItems = ticketItems(t);
                        const waitMins = elapsed(t.created_at);
                        const prepMins = elapsed(t.started_at);
                        const waitColor = waitMins == null ? "var(--text-3)" : waitMins > 21 ? "var(--err)" : waitMins > 15 ? "var(--warn)" : "var(--ok)";

                        return (
                          <div className={`kt-card ${col.key}`} key={t.id}>
                            <div className={`kt-head ${col.key}`}>
                              <div>
                                <div className="order-no" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  {t.orders?.order_no ?? "—"}
                                  <SourcePill source={t.orders?.source} />
                                  <StationBadge station={t.station} />
                                </div>
                                <div className="table-no">
                                  {t.orders?.table_no ? `Table ${t.orders.table_no}` : "Takeaway"}
                                  {t.orders?.customers?.name ? ` · ${t.orders.customers.name}` : ""}
                                </div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                <span className={`pill ${col.color}`}>{STATUS_BADGE[t.kitchen_status] ?? t.kitchen_status}</span>
                                {waitMins != null && (
                                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: waitColor, fontWeight: 700 }} title="Total wait time">
                                    {fmtElapsed(waitMins)}
                                  </span>
                                )}
                                {prepMins != null && (
                                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)" }} title="Prep duration">
                                    prep {fmtElapsed(prepMins)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="kt-body">
                              {visibleItems.length === 0 ? (
                                <div style={{ fontSize: 12, color: "var(--text-4)", fontStyle: "italic" }}>No items for this station</div>
                              ) : (
                                visibleItems.map((item, i) => (
                                  <div key={`${item.name ?? "item"}-${i}`}>
                                    <div className="kt-item">
                                      <span className="qty">×{item.quantity}</span>
                                      <span className="name">{item.name ?? "Unknown"}</span>
                                    </div>
                                    {item.notes && (
                                      <div style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic", marginLeft: 28, marginTop: 1 }}>
                                        ↳ {item.notes}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                            {STATUS_NEXT[t.kitchen_status] && (
                              <div className="kt-foot">
                                <button className="btn-xs primary" style={{ flex: 1 }} disabled={updating === t.id} onClick={() => advance(t)}>
                                  {updating === t.id ? "Updating…" : STATUS_LABEL[t.kitchen_status]}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {tab === "history" && (
        <div className="admin-body">
          {histLoading && <div style={{ textAlign: "center", color: "var(--text-3)", padding: 48, fontFamily: "var(--f-mono)" }}>Loading history…</div>}
          {histError   && <div style={{ textAlign: "center", color: "var(--err)", padding: 48, fontFamily: "var(--f-mono)" }}>{histError}</div>}
          {!histLoading && !histError && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th><th>Station</th><th>Table</th><th>Customer</th><th>Items</th><th>Status</th><th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && <tr><td colSpan={7} className="empty">No completed tickets yet</td></tr>}
                  {history.map(t => (
                    <tr key={t.id}>
                      <td><span className="mono">{t.orders?.order_no ?? "—"}</span></td>
                      <td>
                        {t.station && t.station !== "none" ? (
                          <StationBadge station={t.station} />
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td className="dim">{t.orders?.table_no ? `Table ${t.orders.table_no}` : "Takeaway"}</td>
                      <td className="dim">{t.orders?.customers?.name ?? "—"}</td>
                      <td className="dim" style={{ fontSize: 12 }}>
                        {ticketItems(t).map((it, i, arr) => (
                          <span key={i}>
                            {it.quantity}× {it.name}
                            {it.notes ? ` (${it.notes})` : ""}
                            {i < arr.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </td>
                      <td><span className="pill ok">{t.kitchen_status}</span></td>
                      <td className="dim" style={{ whiteSpace: "nowrap" }}>
                        {t.completed_at ? new Date(t.completed_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
