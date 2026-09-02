/**
 * Prep Display System (PDS)
 * Live ticket queue with station tabs and status advancement
 */
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput,
  ActivityIndicator, Platform, Modal, useWindowDimensions, Vibration,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R, FontSizes } from "../../features/theme/tokens";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { RefreshButton } from "../../features/ui/RefreshButton";
import { useTheme } from "../../features/theme/ThemeContext";
import { PAGE_SIZES } from "../../features/constants";
import { useToast } from "../../features/ui/ToastProvider";
import { usePrinterConfig } from "../../features/receipt/printerConfig";
import { ReceiptPayload } from "../../features/receipt/receiptConfig";
import { printStationTicket } from "../../features/receipt/stationTicketPrintUtils";
import type { StationTicketStation } from "../../features/receipt/generateStationTicketEscPos";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

// ── Notification alert — vibration pattern (no native audio module needed) ────
function playNotifSound() {
  try { Vibration.vibrate([0, 120, 80, 120]); } catch { /* silent */ }
}

type StationFilter = "all" | "kitchen" | "drinks" | "counter";
interface KitchenItem { name: string; sku?: string | null; qty: number; notes?: string | null; }
interface Ticket {
  id: string;
  order_id: string;
  order_no: string;
  table_no: string | null;
  customer_name: string | null;
  source: string | null;
  status: "new" | "prep" | "ready";
  created_at: string;
  order_type?: string;
  serve_location?: string | null;
  station?: string | null;
  items: KitchenItem[];
}

type HistoryFilter = "today" | "week" | "month";

// Raw row shapes returned by the "pos-data" edge function (pre-mapping to Ticket)
interface RawKitchenOrderRef {
  order_no?: string;
  table_no?: string | null;
  order_type?: string;
  serve_location?: string | null;
  source?: string | null;
  customers?: { name?: string | null } | null;
}
interface RawKitchenTicketItem {
  order_items?: {
    products?: { name?: string; sku?: string | null } | null;
    quantity?: number;
    notes?: string | null;
  } | null;
}
interface RawKitchenTicketRow {
  id: string;
  order_id: string;
  created_at: string;
  orders?: RawKitchenOrderRef | null;
  kitchen_ticket_items?: RawKitchenTicketItem[] | null;
  station?: string | null;
  kitchen_status?: string;
  status?: string;
}

function elapsed(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}
function fmtTime(mins: number) {
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function historyRangeStart(f: HistoryFilter): string {
  const d = new Date();
  if (f === "today") { d.setHours(0,0,0,0); return d.toISOString(); }
  if (f === "week")  { d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return d.toISOString(); }
  d.setDate(1); d.setHours(0,0,0,0); return d.toISOString();
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
type C = ReturnType<typeof useTheme>["C"];

function elapsedColor(mins: number, C: C) {
  if (mins >= 20) return C.bad;
  if (mins >= 10) return C.warn;
  return C.good;
}

const STATUS_MAP: Record<string, Ticket["status"]> = {
  new: "new", accepted: "new", preparing: "prep", prep: "prep", ready: "ready",
};
const NEXT: Record<string, string>  = { new: "preparing", prep: "ready", ready: "completed" };
const LABEL: Record<string, string> = { new: "Start Prep", prep: "Mark Ready", ready: "Mark Served" };

export default function KitchenScreen() {
  const { activeWorkspaceId } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const printer = usePrinterConfig();
  const { showToast } = useToast();

  const COLS: { key: Ticket["status"]; label: string; accent: string }[] = [
    { key: "new",   label: "New",       accent: C.info },
    { key: "prep",  label: "Preparing", accent: C.amber },
    { key: "ready", label: "Ready",     accent: C.good },
  ];
  const { width, height } = useWindowDimensions();
  const isPhone = Math.min(width, height) < 600;
  const insets = useSafeAreaInsets();

  const STATION_TABS: { id: StationFilter; label: string; color: string }[] = [
    { id: "all",     label: "All",     color: C.ink3 },
    { id: "kitchen", label: "Kitchen", color: C.amber },
    { id: "drinks",  label: "Drinks",  color: C.info },
    { id: "counter", label: "Counter", color: C.good },
  ];

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("");
  // Minute bucket used only to force TicketCard re-renders when the displayed
  // elapsed-time value (minute granularity) actually changes — not every second.
  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60000));
  const lastMinuteRef = useRef(nowMinute);

  // Sound — ref mirrors state so fetchTickets callback always reads latest value
  const [soundEnabled, _setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const setSoundEnabled = (v: boolean) => { soundEnabledRef.current = v; _setSoundEnabled(v); };
  const prevTicketIds = useRef<Set<string>>(new Set());
  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    setSoundEnabled(next);
    AsyncStorage.setItem("prep_sound_on", next ? "1" : "0");
  }, []);
  const [stationFilter, setStationFilter] = useState<StationFilter>("all");
  const [activeCol, setActiveCol] = useState<Ticket["status"]>("new");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("today");
  const [historyItems, setHistoryItems] = useState<Ticket[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage]         = useState(0);
  const [historyHasMore, setHistoryHasMore]   = useState(false);
  const [printingId, setPrintingId]           = useState<string | null>(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historySearch, setHistorySearch]     = useState("");

  const filteredHistoryItems = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return historyItems;
    return historyItems.filter(t =>
      t.order_no.toLowerCase().includes(q) ||
      (t.table_no ?? "").toLowerCase().includes(q) ||
      (t.customer_name ?? "").toLowerCase().includes(q) ||
      t.items.some(it => it.name.toLowerCase().includes(q))
    );
  }, [historyItems, historySearch]);

  const historyStats = useMemo(() => ({
    tickets: historyItems.length,
    items: historyItems.reduce((sum, t) => sum + t.items.reduce((s, it) => s + it.qty, 0), 0),
  }), [historyItems]);

  // Restore sound preference
  useEffect(() => {
    AsyncStorage.getItem("prep_sound_on").then(v => {
      if (v !== null) setSoundEnabled(v === "1");
    });
  }, []);

  // Clock + elapsed.
  // The header clock displays seconds, so it still ticks every 1s. The ticket
  // cards only display minute-granularity elapsed time, so we track a separate
  // `nowMinute` bucket that only changes (and is only passed down as a prop)
  // once per minute — combined with React.memo on TicketCard, this means the
  // ticket list only re-renders once a minute instead of every second.
  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== lastMinuteRef.current) {
        lastMinuteRef.current = minute;
        setNowMinute(minute);
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, []);

  const loadHistory = useCallback(async (filter: HistoryFilter, pageNum = 0) => {
    if (!activeWorkspaceId) return;
    const isFirst = pageNum === 0;
    if (isFirst) setHistoryLoading(true); else setHistoryLoadingMore(true);
    const from = pageNum * PAGE_SIZES.kitchenHistory, to = from + PAGE_SIZES.kitchenHistory - 1;
    try {
      const { data: res, error: err } = await invokeFn<Record<string, RawKitchenTicketRow[]>>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "kitchen-history",
        params: {
          kitchen_status_in: ["served", "completed"],
          created_at_gte: historyRangeStart(filter),
          from,
          to,
        },
      });
      if (err) throw err;
      const data = res?.["kitchen-history"] ?? [];
      const mapped: Ticket[] = (data ?? []).map((t: RawKitchenTicketRow) => ({
        id: t.id,
        order_id: t.order_id,
        order_no: t.orders?.order_no ?? "—",
        table_no: t.orders?.table_no ?? null,
        customer_name: t.orders?.customers?.name ?? null,
        source: t.orders?.source ?? null,
        order_type: t.orders?.order_type ?? "dine_in",
        serve_location: t.orders?.serve_location ?? null,
        status: "ready" as const,
        created_at: t.created_at,
        items: (t.kitchen_ticket_items ?? []).map((kti: RawKitchenTicketItem) => ({
          name: kti.order_items?.products?.name ?? "Item",
          sku: kti.order_items?.products?.sku ?? null,
          qty: kti.order_items?.quantity ?? 1,
          notes: kti.order_items?.notes ?? null,
        })),
      }));
      setHistoryItems(prev => isFirst ? mapped : [...prev, ...mapped]);
      setHistoryHasMore(mapped.length === PAGE_SIZES.kitchenHistory);
      setHistoryPage(pageNum);
    } catch { /* silent */ }
    finally {
      if (isFirst) setHistoryLoading(false); else setHistoryLoadingMore(false);
    }
  }, [activeWorkspaceId]);

  // Reprints ONLY this ticket's own station — not the order's other station
  // ticket, and not the server checklist. This button lives on a single
  // TicketCard (one station), so printStationTickets() (plural — kitchen +
  // drinks + checklist, unconditionally) would reprint things nobody asked
  // for; printStationTicket() (singular) prints just the station passed in.
  // History rows don't carry prices or prep_station, so fetch the full order
  // items first — the same "receipts-order-items" resource the Receipts
  // reprint screen uses — then build a minimal ReceiptPayload. Station
  // tickets never render pricing (see generateStationTicketEscPos), so the
  // money fields are just zeroed out rather than fetched.
  const handlePrintTicket = useCallback(async (ticket: Ticket) => {
    if (!activeWorkspaceId || !ticket.order_id) return;
    setPrintingId(ticket.id);
    try {
      const { data, error } = await invokeFn<{ "receipts-order-items": {
        quantity: number; notes: string | null; products: { name: string; sku?: string | null; prep_station?: string | null } | null;
      }[] }>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "receipts-order-items",
        params: { order_id: ticket.order_id },
      });
      if (error) throw error;
      const items = data?.["receipts-order-items"] ?? [];
      const payload: ReceiptPayload = {
        orderNo: ticket.order_no,
        orderId: ticket.order_id,
        items: items.map(i => ({
          name: i.products?.name ?? "Item",
          sku: i.products?.sku ?? null,
          qty: i.quantity,
          price: 0,
          notes: i.notes,
          prep_station: i.products?.prep_station ?? null,
        })),
        bookings: [],
        subtotal: 0, tax: 0, taxRatePct: 0, serviceFee: 0, svcRatePct: 0, discount: 0, total: 0,
        cashAmt: 0, change: 0, payMethod: "", refNumber: "",
        orderType: ticket.order_type ?? "dine_in",
        tableNo: ticket.table_no ?? "",
        customerName: ticket.customer_name ?? "",
        floor: ticket.serve_location ?? undefined,
        timestamp: ticket.created_at,
      };
      const station = (ticket.station ?? "kitchen") as StationTicketStation;
      await printStationTicket(payload, station, printer);
      showToast({ title: "Printed", message: `Ticket #${ticket.order_no} sent to printer`, type: "success" });
    } catch (e: any) {
      showToast({ title: "Print failed", message: e?.message ?? "Unknown error", type: "error" });
    } finally {
      setPrintingId(null);
    }
  }, [activeWorkspaceId, printer, showToast]);

  const fetchTickets = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const { data: res, error: err } = await invokeFn<Record<string, RawKitchenTicketRow[]>>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "kitchen-live-tickets",
        params: {},
      });
      if (err) throw err;
      const data = res?.["kitchen-live-tickets"] ?? [];
      const mapped: Ticket[] = (data ?? []).map((t: RawKitchenTicketRow) => ({
        id: t.id,
        order_id: t.order_id,
        order_no: t.orders?.order_no ?? "—",
        table_no: t.orders?.table_no ?? null,
        customer_name: t.orders?.customers?.name ?? null,
        source: t.orders?.source ?? null,
        order_type: t.orders?.order_type ?? "dine_in",
        serve_location: t.orders?.serve_location ?? null,
        status: STATUS_MAP[t.kitchen_status ?? t.status ?? "new"] ?? "new",
        created_at: t.created_at,
        station: t.station ?? "kitchen",
        // kitchen_ticket_items already contains exactly the items for this station ticket
        items: (t.kitchen_ticket_items ?? []).map((kti: RawKitchenTicketItem) => ({
          name: kti.order_items?.products?.name ?? "Item",
          sku: kti.order_items?.products?.sku ?? null,
          qty: kti.order_items?.quantity ?? 1,
          notes: kti.order_items?.notes ?? null,
        })),
      }));
      // Play sound when new tickets appear (skip on initial load when prevTicketIds is empty)
      if (prevTicketIds.current.size > 0 && mapped.some(t => !prevTicketIds.current.has(t.id))) {
        if (soundEnabledRef.current) playNotifSound();
      }
      prevTicketIds.current = new Set(mapped.map(t => t.id));
      setTickets(mapped);
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  async function manualRefresh() {
    setRefreshing(true);
    try { await fetchTickets(); } finally { setRefreshing(false); }
  }

  // Use Date.now() so every mount gets a globally unique channel name.
  // supabase.channel() looks up existing channels by name before creating a new one —
  // removeChannel is async (awaits server leave-ack), so during cleanup the old channel
  // is still registered. A per-mount counter resets to 0 on each new component instance,
  // causing a name collision with the still-registered old channel. Date.now() is unique
  // across any cleanup window.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    // Guards the postgres_changes callback for THIS channel instance only.
    // removeChannel() is async (awaits the server leave-ack), so a fast
    // unmount/remount (e.g. quick tab switching) can leave this callback
    // still firing — and calling fetchTickets() — until the leave completes,
    // alongside the new channel's callback doing the same. Flipping `active`
    // false in the cleanup stops this specific instance from triggering any
    // more fetches once it's torn down.
    let active = true;
    const name = `kitchen-live-${activeWorkspaceId}-${Date.now()}`;
    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_tickets", filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => { if (active) fetchTickets(); },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  // 30s fallback poll in case realtime drops or never delivers events.
  // NOTE: this used to skip the fetch whenever channelStatusRef.current was
  // "SUBSCRIBED", on the assumption that meant realtime was healthy. It
  // doesn't — "SUBSCRIBED" only means the websocket handshake succeeded, not
  // that Postgres is actually publishing change events for this table (e.g.
  // if the table was never added to the supabase_realtime publication, the
  // channel still reports SUBSCRIBED but zero events ever arrive). Always
  // poll; a redundant fetch every 30s is cheap and correctness matters more.
  useEffect(() => {
    const id = setInterval(() => { fetchTickets(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchTickets]);

  // Stable across renders (useCallback) so it can be passed directly to the
  // memoized TicketCard without creating a new function reference every
  // render — a new reference on every parent render would defeat React.memo.
  const advance = useCallback(async (ticket: Ticket) => {
    const next = NEXT[ticket.status];
    if (!next) return;
    setUpdating(ticket.id);
    try {
      const { data, error } = await supabase.functions.invoke("kitchen-update-status", {
        body: { workspace_id: activeWorkspaceId, ticket_id: ticket.id, status: next },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Update failed");
      if (next === "completed") {
        setTickets(prev => prev.filter(t => t.id !== ticket.id));
      } else {
        const mapped = STATUS_MAP[next] ?? "new";
        setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: mapped } : t));
      }
    } catch (e: any) { setError(e?.message ?? "Update failed"); }
    finally { setUpdating(null); }
  }, [activeWorkspaceId]);


  const visibleTickets = stationFilter === "all"
    ? tickets
    : tickets.filter(t => (t.station ?? "kitchen") === stationFilter);

  return (
    <View style={s.root}>
      {/* Header */}
      <PosScreenHeader title="Prep Display"
        right={<>
          <View style={s.headerPill}>
            <View style={[s.dot, { backgroundColor: C.good }]} />
            <Text style={[s.headerPillText, { color: C.good }]}>{visibleTickets.length} active</Text>
          </View>
          {error ? <Text style={s.errorText}>⚠ {error}</Text> : null}
          <Pressable hitSlop={8} style={s.soundBtn} onPress={toggleSound}>
            <Feather name={soundEnabled ? "volume-2" : "volume-x"} size={16} color={soundEnabled ? C.amber : C.ink4} />
          </Pressable>
          <Pressable style={s.historyBtn} onPress={() => { setHistoryOpen(true); setHistorySearch(""); loadHistory(historyFilter); }}>
            <Text style={[s.clock, { fontSize: 13, color: C.ink3 }]}>History</Text>
          </Pressable>
          <RefreshButton onPress={manualRefresh} refreshing={refreshing} compact />
          <Text style={[s.clock, { color: C.amber }]}>{clock}</Text>
        </>} />

      {/* Station filter + columns — hidden together while loading to prevent partial flash */}
      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={C.amber} size="large" />
          <Text style={s.loadingText}>LOADING TICKETS…</Text>
        </View>
      ) : <>
        <View style={[s.stationBar, { paddingLeft: Math.max(insets.left, 12), paddingRight: Math.max(insets.right, 12) }]}>
          <Text style={s.stationBarLabel}>Station</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stationChips}>
            {STATION_TABS.map(tab => {
              const count = tab.id === "all" ? tickets.length : tickets.filter(t => (t.station ?? "kitchen") === tab.id).length;
              const active = stationFilter === tab.id;
              return (
                <Pressable key={tab.id}
                  style={[s.stationChip, active && { borderColor: tab.color, backgroundColor: `${tab.color}20` }]}
                  onPress={() => setStationFilter(tab.id)}>
                  <Text style={[s.stationChipTxt, { color: active ? tab.color : C.ink3 }]}>{tab.label}</Text>
                  {count > 0 && (
                    <View style={[s.stationChipBadge, { backgroundColor: active ? tab.color : C.surface2 }]}>
                      <Text style={[s.stationChipBadgeTxt, { color: active ? "#fff" : C.ink3 }]}>{count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {isPhone ? (
        /* ── Phone: tab bar + single scrollable column ── */
        <View style={{ flex: 1 }}>
          <View style={[s.tabBar, { paddingLeft: Math.max(insets.left, 12), paddingRight: Math.max(insets.right, 12) }]}>
            {COLS.map(col => {
              const count = visibleTickets.filter(t => t.status === col.key).length;
              const active = activeCol === col.key;
              return (
                <Pressable key={col.key} style={[s.tabBtn, active && { borderBottomColor: col.accent, borderBottomWidth: 2 }]} onPress={() => setActiveCol(col.key)}>
                  <Text style={[s.tabLabel, { color: active ? col.accent : C.ink3 }]}>{col.label}</Text>
                  {count > 0 && (
                    <View style={[s.tabBadge, { backgroundColor: col.accent }]}>
                      <Text style={s.tabBadgeText}>{count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          {(() => {
            const col = COLS.find(c => c.key === activeCol)!;
            const items = visibleTickets.filter(t => t.status === col.key);
            return (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[s.mobileColContent, { paddingBottom: Math.max(insets.bottom, 16), paddingLeft: Math.max(insets.left, 12), paddingRight: Math.max(insets.right, 12) }]}
                showsVerticalScrollIndicator={false}
              >
                {items.length === 0 ? (
                  <View style={s.emptyCol}>
                    <Text style={s.emptyColText}>No tickets</Text>
                  </View>
                ) : (
                  items.map(ticket => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      colAccent={col.accent}
                      updating={updating === ticket.id}
                      nowMinute={nowMinute}
                      onAdvance={advance}
                      onPrint={handlePrintTicket}
                      printing={printingId === ticket.id}
                    />
                  ))
                )}
              </ScrollView>
            );
          })()}
        </View>
      ) : (
        /* ── Tablet: 3-column layout ── */
        <View style={[s.colsWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {COLS.map(col => {
            const items = visibleTickets.filter(t => t.status === col.key);
            return (
              <View key={col.key} style={s.col}>
                <View style={s.colHead}>
                  <View style={[s.colDot, { backgroundColor: col.accent }]} />
                  <Text style={[s.colLabel, { color: C.ink }]}>{col.label}</Text>
                  <View style={s.colCount}>
                    <Text style={[s.colCountText, { fontFamily: MONO }]}>{items.length}</Text>
                  </View>
                </View>
                <ScrollView style={s.colBody} showsVerticalScrollIndicator={false}>
                  {items.length === 0 ? (
                    <View style={s.emptyCol}>
                      <Text style={s.emptyColText}>No tickets</Text>
                    </View>
                  ) : (
                    items.map(ticket => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        colAccent={col.accent}
                        updating={updating === ticket.id}
                        nowMinute={nowMinute}
                        onAdvance={advance}
                        onPrint={handlePrintTicket}
                        printing={printingId === ticket.id}
                      />
                    ))
                  )}
                </ScrollView>
              </View>
            );
          })}
        </View>
      )}
      </>}

      <Modal visible={historyOpen} animationType="fade" transparent onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={{ flex:1, backgroundColor:"rgba(0,0,0,0.6)", justifyContent:"center", alignItems:"center", padding:16 }} onPress={() => setHistoryOpen(false)}>
          <Pressable style={{ backgroundColor: C.bg2, borderRadius: 20, height:"92%", paddingBottom:20, width:"100%", maxWidth: isPhone ? 520 : 1080 }} onPress={() => {}}>
            {/* Header */}
            <View style={{ flexDirection:"row", alignItems:"center", paddingHorizontal:22, paddingBottom:12, paddingTop:20, borderBottomWidth:1, borderBottomColor:C.line }}>
              <Text style={{ color:C.ink, fontSize:19, fontWeight:"700", flex:1 }}>Prep History</Text>
              {!historyLoading && (
                <Text style={{ color:C.ink3, fontSize:12, fontFamily:MONO, marginRight:16 }}>
                  {historyStats.tickets}{historyHasMore ? "+" : ""} tickets · {historyStats.items}{historyHasMore ? "+" : ""} items served
                </Text>
              )}
              <Pressable onPress={() => setHistoryOpen(false)} hitSlop={16}>
                <Text style={{ color:C.ink3, fontSize:22 }}>✕</Text>
              </Pressable>
            </View>
            {/* Date filter + search */}
            <View style={{ flexDirection: isPhone ? "column" : "row", gap:10, padding:16 }}>
              <View style={{ flexDirection:"row", gap:8, flex: isPhone ? undefined : 1 }}>
                {(["today","week","month"] as HistoryFilter[]).map(f => (
                  <Pressable key={f} onPress={() => { setHistoryFilter(f); setHistorySearch(""); loadHistory(f); }}
                    style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                      backgroundColor: historyFilter===f ? C.amber : C.surface,
                      borderWidth:1, borderColor: historyFilter===f ? C.amber : C.line }}>
                    <Text style={{ color: historyFilter===f ? C.bg : C.ink3, fontSize:13, fontWeight:"600", textTransform:"capitalize" }}>{f}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection:"row", alignItems:"center", gap:8, flex: isPhone ? undefined : 1.2,
                backgroundColor:C.surface, borderRadius:8, borderWidth:1, borderColor:C.line, paddingHorizontal:12 }}>
                <Feather name="search" size={14} color={C.ink4} />
                <TextInput
                  value={historySearch}
                  onChangeText={setHistorySearch}
                  placeholder="Search order #, table, or item…"
                  placeholderTextColor={C.ink4}
                  style={{ flex:1, color:C.ink, fontSize:13, paddingVertical:9 }}
                />
                {historySearch.length > 0 && (
                  <Pressable onPress={() => setHistorySearch("")} hitSlop={8}>
                    <Feather name="x" size={14} color={C.ink4} />
                  </Pressable>
                )}
              </View>
            </View>
            {/* List */}
            {historyLoading ? (
              <View style={{ padding:40, alignItems:"center" }}>
                <ActivityIndicator color={C.amber} />
              </View>
            ) : historyItems.length === 0 ? (
              <View style={{ padding:40, alignItems:"center" }}>
                <Text style={{ color:C.ink4, fontSize:13, fontFamily:MONO }}>No served tickets for this period</Text>
              </View>
            ) : filteredHistoryItems.length === 0 ? (
              <View style={{ padding:40, alignItems:"center" }}>
                <Text style={{ color:C.ink4, fontSize:13, fontFamily:MONO }}>No matches for "{historySearch}"</Text>
              </View>
            ) : (
              <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingHorizontal:16, paddingBottom:8 }}>
                <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
                  {filteredHistoryItems.map(ticket => {
                    const fallbackLabel = ticket.order_type === "qr_order" ? "QR" : ticket.order_type?.replace("_"," ") ?? "Walk-in";
                    const tableLabel    = ticket.table_no ? `Table ${ticket.table_no}` : fallbackLabel;
                    const ticketItemCount = ticket.items.reduce((s, it) => s + it.qty, 0);
                    return (
                      <View key={ticket.id} style={{ width: isPhone ? "100%" : "32%", minWidth: isPhone ? undefined : 260,
                        backgroundColor:C.surface, borderRadius:10, borderWidth:1, borderColor:C.line, borderTopWidth:3, borderTopColor:C.good, padding:12, gap:6 }}>
                        <View style={{ flexDirection:"row", justifyContent:"space-between" }}>
                          <Text style={{ color:C.ink, fontSize:14, fontWeight:"700", fontFamily:MONO }}>#{ticket.order_no}</Text>
                          <Text style={{ color:C.ink4, fontSize:11, fontFamily:MONO }}>{fmtDateTime(ticket.created_at)}</Text>
                        </View>
                        <View style={{ flexDirection:"row", justifyContent:"space-between" }}>
                          <Text style={{ color:C.ink3, fontSize:12 }}>{tableLabel}</Text>
                          {ticket.customer_name && <Text style={{ color:C.ink3, fontSize:11 }}>{ticket.customer_name}</Text>}
                        </View>
                        <View style={{ borderTopWidth:1, borderTopColor:C.lineSoft, paddingTop:6, gap:4 }}>
                          {ticket.items.map((it, i) => (
                            <View key={i} style={{ flexDirection:"row", justifyContent:"space-between" }}>
                              <Text style={{ color:C.ink2, fontSize:12, flex:1 }}>{it.name}</Text>
                              <Text style={{ color:C.amber, fontSize:12, fontFamily:MONO }}>×{it.qty}</Text>
                            </View>
                          ))}
                        </View>
                        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
                          <View style={{ backgroundColor:`${C.good}20`, borderRadius:6, paddingHorizontal:8, paddingVertical:3 }}>
                            <Text style={{ color:C.good, fontSize:10, fontWeight:"700", fontFamily:MONO }}>SERVED</Text>
                          </View>
                          <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
                            <Text style={{ color:C.ink4, fontSize:10, fontFamily:MONO }}>{ticketItemCount} item{ticketItemCount===1?"":"s"}</Text>
                            <Pressable
                              onPress={() => handlePrintTicket(ticket)}
                              disabled={printingId === ticket.id}
                              hitSlop={8}
                              style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:`${C.ink3}15`, borderRadius:6, borderWidth:1, borderColor:C.line, paddingHorizontal:8, paddingVertical:4 }}
                            >
                              {printingId === ticket.id
                                ? <ActivityIndicator color={C.ink3} size="small" />
                                : <>
                                    <Feather name="printer" size={13} color={C.ink2} />
                                    <Text style={{ color:C.ink2, fontSize:10, fontWeight:"600", fontFamily:MONO }}>Reprint</Text>
                                  </>
                              }
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
                {historyHasMore && !historySearch && (
                  <Pressable
                    onPress={() => loadHistory(historyFilter, historyPage + 1)}
                    disabled={historyLoadingMore}
                    style={{ padding: 14, alignItems: "center", borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginVertical: 10 }}
                  >
                    {historyLoadingMore
                      ? <ActivityIndicator color={C.amber} size="small" />
                      : <Text style={{ color: C.ink3, fontSize: 13 }}>Load More</Text>
                    }
                  </Pressable>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const STATION_META: Record<string, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  kitchen: { icon: "thermometer", label: "Kitchen" },
  drinks: { icon: "coffee", label: "Drinks" },
  counter: { icon: "package", label: "Counter" },
};

const SOURCE_COLOR: Record<string, string> = {
  pos:   "#f5a524",
  web:   "#3b82f6",
  kiosk: "#22c55e",
  qr:    "#a855f7",
};

// Wrapped in React.memo so ticket cards only re-render when their own props
// change. `ticket` and `onAdvance` are stable references from the parent
// (ticket only changes when its data actually changes; onAdvance is a
// useCallback), and `nowMinute` only changes once a minute — so with this
// memo, a card only re-renders roughly once/minute (or when its data or
// status actually changes) instead of on every 1s clock tick.
const TicketCard = memo(function TicketCard({ ticket, colAccent, updating, nowMinute, onAdvance, onPrint, printing }: Readonly<{
  ticket: Ticket;
  colAccent: string;
  updating: boolean;
  nowMinute: number;
  onAdvance: (ticket: Ticket) => void;
  onPrint: (ticket: Ticket) => void;
  printing: boolean;
}>) {
  void nowMinute; // only used to control memo re-render cadence for elapsed()/fmtTime() below
  const { C, FS } = useTheme();
  const tc = useMemo(() => makeTcStyles(C, FS), [C, FS]);
  const mins = elapsed(ticket.created_at);
  const color = elapsedColor(mins, C);
  const pct   = Math.min(100, (mins / 20) * 100);
  const next  = NEXT[ticket.status];
  const label = LABEL[ticket.status] ?? "Advance";

  const src = (ticket.source ?? "pos").toLowerCase();
  const srcColor = SOURCE_COLOR[src] ?? SOURCE_COLOR.pos;

  const fallbackLabel = ticket.order_type === "qr_order" ? "QR" : ticket.order_type?.replace("_", " ") ?? "Walk-in";
  const tableLabel    = ticket.table_no ? `Table ${ticket.table_no}` : fallbackLabel;
  const stationMeta   = ticket.station ? STATION_META[ticket.station] : undefined;

  return (
    <View style={[tc.card, { borderTopColor: colAccent }]}>
      {/* Top row */}
      <View style={tc.topRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[tc.orderNo, { fontFamily: MONO }]}>#{ticket.order_no}</Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, backgroundColor: `${srcColor}22` }}>
            <Text style={{ fontSize: 9, fontWeight: "700", color: srcColor, fontFamily: MONO }}>{src.toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[tc.statusBadge, { backgroundColor: `${colAccent}22` }]}>
            <Text style={[tc.statusText, { color: colAccent }]}>
              {({ new: "New", prep: "Preparing", ready: "Ready" } as Record<string, string>)[ticket.status] ?? "Ready"}
            </Text>
          </View>
          {/* Quick reprint — lets the kitchen/drinks station reprint this
              ticket right from the live queue (e.g. a torn/misread slip)
              without needing to find it later in History. */}
          <Pressable
            onPress={() => onPrint(ticket)}
            disabled={printing}
            hitSlop={8}
            style={{ padding: 5, borderRadius: 6, backgroundColor: `${C.ink3}18`, borderWidth: 1, borderColor: C.line }}
          >
            {printing
              ? <ActivityIndicator color={C.ink3} size="small" />
              : <Feather name="printer" size={13} color={C.ink3} />
            }
          </Pressable>
        </View>
      </View>

      {/* Station badge */}
      {Boolean(stationMeta) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: `${colAccent}18`, marginBottom: 2 }}>
          <Feather name={stationMeta!.icon} size={10} color={colAccent} />
          <Text style={{ fontSize: 10, fontWeight: "700", color: colAccent }}>{stationMeta!.label}</Text>
        </View>
      )}

      {/* Table + time */}
      <View style={tc.infoRow}>
        <Text style={tc.tableLabel}>{tableLabel}</Text>
        <Text style={[tc.timeLabel, { color, fontFamily: MONO }]}>{fmtTime(mins)}</Text>
      </View>

      {/* Customer */}
      {ticket.customer_name && (
        <Text style={tc.customer}>{ticket.customer_name}</Text>
      )}

      {/* Elapsed bar */}
      <View style={tc.barBg}>
        <View style={[tc.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>

      {/* Items */}
      <View style={tc.items}>
        {ticket.items.map((it, i) => (
          <View key={`${it.name}-${i}`}>
            <View style={tc.itemRow}>
              <Text style={tc.itemName}>{it.sku ? <Text style={tc.itemSku}>{it.sku} </Text> : null}{it.name}</Text>
              <Text style={[tc.itemQty, { color: C.amber, fontFamily: MONO }]}>×{it.qty}</Text>
            </View>
            {it.notes ? <Text style={tc.itemNote}>↳ {it.notes}</Text> : null}
          </View>
        ))}
      </View>

      {/* Advance button */}
      {!!next && (
        <Pressable
          style={[tc.advBtn, ticket.status === "ready" && tc.advBtnReady, updating && { opacity: 0.5 }]}
          onPress={() => onAdvance(ticket)}
          disabled={updating}
        >
          <Text style={[tc.advBtnText, ticket.status === "ready" && { color: "#000000" }]}>
            {updating ? "…" : label}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

const makeStyles = (C: C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  menuBtn:  { paddingVertical: 4, paddingRight: 4 },
  backBtn:  { paddingRight: 6 },
  backText: { color: C.amber, fontSize: 15, fontWeight: "600" },
  title:    { color: C.ink, fontSize: 17, fontWeight: "700" },
  headerPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: R.full, backgroundColor: C.goodBg,
    borderWidth: 1, borderColor: "rgba(72,168,110,0.3)",
  },
  dot:            { width: 6, height: 6, borderRadius: 3 },
  headerPillText: { fontSize: 11, fontFamily: MONO },
  errorText: { color: C.bad, fontSize: 11, fontFamily: MONO, flex: 1 },
  clock: { fontSize: 16, fontFamily: MONO, letterSpacing: 1 },
  historyBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.line,
  },
  soundBtn: { padding: 7, borderRadius: R.sm },

  stationBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.bg2,
    borderBottomWidth: 1, borderBottomColor: C.line,
    paddingVertical: 8,
  },
  stationBarLabel: { color: C.ink4, fontSize: 10, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", fontFamily: MONO },
  stationChips: { flexDirection: "row", gap: 6, alignItems: "center" },
  stationChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: R.full, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface,
  },
  stationChipTxt: { fontSize: 12, fontWeight: "600" },
  stationChipBadge: { minWidth: 16, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 8, alignItems: "center" },
  stationChipBadgeTxt: { fontSize: 10, fontWeight: "700", fontFamily: MONO },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: C.ink3, fontFamily: MONO, fontSize: 12, letterSpacing: 2 },

  colsWrap: { flex: 1, flexDirection: "row", padding: 12, gap: 10 },
  col: {
    flex: 1,
    backgroundColor: C.bg2, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    overflow: "hidden",
  },
  colHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colLabel: { fontSize: 16, fontWeight: "600", flex: 1 },
  colCount: {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: C.surface, borderRadius: R.full,
  },
  colCountText: { color: C.ink3, fontSize: 11 },
  colBody: { flex: 1, padding: 10 },

  emptyCol: {
    margin: 12, padding: 20, borderRadius: R.md,
    borderWidth: 1, borderColor: C.lineSoft, borderStyle: "dashed",
    alignItems: "center",
  },
  emptyColText: { color: C.ink4, fontSize: 12 },

  tabBar: {
    flexDirection: "row", backgroundColor: C.bg2,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontWeight: "600" },
  tabBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", fontFamily: MONO },
  mobileColContent: { padding: 12, gap: 0 },
});

const makeTcStyles = (C: C, FS: FontSizes) => StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: 9,
    borderWidth: 1, borderColor: C.line,
    borderTopWidth: 3, borderTopColor: C.info,
    padding: 12, marginBottom: 10, gap: 7,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderNo: { fontSize: FS.xs, color: C.ink3 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full },
  statusText:  { fontSize: FS.xs, fontWeight: "600", letterSpacing: 0.5 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  tableLabel: { fontSize: FS.xxl, fontWeight: "700", color: C.ink, letterSpacing: -0.3 },
  timeLabel:  { fontSize: FS.md, fontWeight: "700" },
  customer:   { fontSize: FS.xs, color: C.ink3 },
  barBg: { height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
  items: { paddingTop: 6, borderTopWidth: 1, borderTopColor: C.lineSoft, gap: 5 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  itemName: { color: C.ink, fontSize: FS.sm, fontWeight: "500", flex: 1 },
  itemSku:  { color: C.ink4, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.5 },
  itemQty:  { fontSize: FS.sm, fontWeight: "700" },
  itemNote: { color: C.ink3, fontSize: FS.xs, fontStyle: "italic", marginTop: 1 },
  advBtn: {
    padding: 10, borderRadius: R.md, alignItems: "center",
    backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line,
  },
  advBtnReady: { backgroundColor: C.good, borderColor: C.good },
  advBtnText:  { color: C.ink, fontSize: FS.md, fontWeight: "600" },
});
